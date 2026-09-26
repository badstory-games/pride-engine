/**
 * WebAudio-менеджер.
 *
 * Задачи:
 *   - декодировать загруженные звуки в AudioBuffer и хранить их по id;
 *   - запускать проигрывания (play) с громкостью, панорамой, тоном, циклом;
 *   - управлять группами проигрываний по имени (stop / setPan / setPitch);
 *   - фейды (fadeIn / fadeOut);
 *   - master gain;
 *   - suspend/resume при паузе игры;
 *   - копить события «звук завершился» для условия OnSoundEnded.
 *
 * Декодирование.
 *   decode(id, bytes) — возвращает Promise<AudioBuffer|null>. Дедуплицировано:
 *   параллельные вызовы для одного id получают один и тот же промис.
 *
 *   queueDecode(id, bytes) — НЕ блокирует вызывающего. Кладёт задачу
 *   в очередь, которая разбирается по одной в фоне. Между задачами
 *   отдаётся управление браузеру — редактор остаётся отзывчивым.
 *
 *   isDecoding(id) — true, если id ждёт в очереди или декодируется сейчас.
 *   isReady(id)    — true, если буфер уже готов.
 *
 * Переименование (rename).
 *   Согласованно обновляет buffers, _decodePromises, _decodeRefs,
 *   _decodeQueue и активные проигрывания. Если декодирование ещё
 *   в полёте — благодаря мутабельному ref оно запишет буфер под новым
 *   id, а не под старым, который был захвачен в замыкании.
 *
 * onStateChange — колбэк без аргументов. Вызывается при добавлении в
 *   очередь, начале и завершении каждой задачи. Используется UI для
 *   показа индикатора прогресса. Может вызываться часто — подписчик
 *   должен сам дебаунсить перерисовку.
 *
 * WebAudio context создаётся лениво — при первом resume() или decode().
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;

    /** @type {Map<string, AudioBuffer>} */
    this.buffers = new Map();

    /** @type {Map<number, {name, source, gain, panner, _manualStop?}>} */
    this.playing = new Map();
    this._nextPlaybackId = 1;

    /** Имена звуков, завершившихся в этом кадре (до drainEnded). */
    this._endedBuffer = [];

    this._masterVolume = 1;
    this._enabled = true;

    // ---- Фоновая очередь декодирования ----
    /** @type {Array<{id:string, bytes:ArrayBuffer}>} */
    this._decodeQueue = [];

    /** @type {Map<string, Promise<AudioBuffer|null>>} */
    this._decodePromises = new Map();

    /**
     * Мутабельные ссылки на «текущий» id задачи декодирования.
     * Нужны, потому что decode() захватывает id в замыкании для
     * записи буфера. rename() подменяет содержимое ref — и запись
     * уходит под новое имя.
     * @type {Map<string, {id:string}>}
     */
    this._decodeRefs = new Map();

    this._decodeInFlight = false;

    /** Колбэк при изменении состояния очереди/готовности. */
    this.onStateChange = null;
  }

  // ============================================================
  // Context lifecycle
  // ============================================================

  _ensureContext() {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      console.warn('[audio] WebAudio не поддерживается этим браузером');
      this._enabled = false;
      return null;
    }
    try {
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._masterVolume;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[audio] не удалось создать AudioContext:', e);
      this._enabled = false;
      return null;
    }
    return this.ctx;
  }

  resume() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch((e) => console.warn('[audio] resume failed:', e));
    }
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  _emitStateChange() {
    if (!this.onStateChange) return;
    try { this.onStateChange(); } catch {}
  }

  // ============================================================
  // Decoding
  // ============================================================

  decode(id, arrayBuffer) {
    const ctx = this._ensureContext();
    if (!ctx) return Promise.resolve(null);

    if (this.buffers.has(id)) {
      return Promise.resolve(this.buffers.get(id));
    }
    if (this._decodePromises.has(id)) {
      return this._decodePromises.get(id);
    }

    // Мутабельный ref: если rename() случится, пока decodeAudioData
    // считает, финальный buffers.set пойдёт под новым id.
    const ref = { id };
    this._decodeRefs.set(id, ref);

    const promise = (async () => {
      try {
        const buf = arrayBuffer.slice(0);
        const audioBuffer = await ctx.decodeAudioData(buf);
        this.buffers.set(ref.id, audioBuffer);
        this._emitStateChange();
        return audioBuffer;
      } catch (e) {
        console.warn(`[audio] decode "${ref.id}" failed:`, e);
        this._emitStateChange();
        return null;
      } finally {
        // ref.id — актуальный ключ на момент завершения (учтён rename).
        this._decodePromises.delete(ref.id);
        this._decodeRefs.delete(ref.id);
      }
    })();

    this._decodePromises.set(id, promise);
    return promise;
  }

  /**
   * Не блокирует. Кладёт декодирование в фоновую очередь.
   * Возвращает true, если задача реально добавлена.
   */
  queueDecode(id, bytes) {
    if (!bytes) return false;
    if (this.buffers.has(id)) return false;
    if (this._decodePromises.has(id)) return false;
    if (this._decodeQueue.some((e) => e.id === id)) return false;

    this._decodeQueue.push({ id, bytes });
    this._pump();
    this._emitStateChange();
    return true;
  }

  /**
   * Массовая постановка в очередь: [{id, bytes}, ...].
   */
  queueDecodeMany(entries) {
    if (!Array.isArray(entries)) return;
    let added = false;
    for (const e of entries) {
      if (!e || !e.id || !e.bytes) continue;
      if (this.queueDecode(e.id, e.bytes)) added = true;
    }
    if (added) this._emitStateChange();
  }

  /**
   * Один проход очереди. Между задачами — setTimeout 0, чтобы
   * не блокировать main thread.
   */
  async _pump() {
    if (this._decodeInFlight) return;
    if (this._decodeQueue.length === 0) return;
    this._decodeInFlight = true;

    while (this._decodeQueue.length > 0) {
      const { id, bytes } = this._decodeQueue.shift();
      if (this.buffers.has(id)) {
        this._emitStateChange();
        continue;
      }
      if (this._decodePromises.has(id)) {
        this._emitStateChange();
        continue;
      }

      try {
        await this.decode(id, bytes);
      } catch {}

      this._emitStateChange();
      await new Promise((r) => setTimeout(r, 0));
    }

    this._decodeInFlight = false;
    this._emitStateChange();
  }

  /** Готов ли буфер. */
  isReady(id) { return this.buffers.has(id); }

  /**
   * В очереди или декодируется сейчас. false для готовых и неизвестных.
   */
  isDecoding(id) {
    if (!id) return false;
    if (this.buffers.has(id)) return false;
    if (this._decodePromises.has(id)) return true;
    for (let i = 0; i < this._decodeQueue.length; i++) {
      if (this._decodeQueue[i].id === id) return true;
    }
    return false;
  }

  getPendingCount() {
    return this._decodeQueue.length + (this._decodeInFlight ? 1 : 0);
  }

  getDuration(id) {
    const b = this.buffers.get(id);
    return b ? b.duration : 0;
  }

  /**
   * Согласованно переименовывает звук во всех внутренних структурах:
   * готовый буфер, промис декодирования, мутабельный ref, очередь и
   * активные проигрывания. Идемпотентен при oldId === newId.
   */
  rename(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;

    // 1. Готовый буфер
    const buf = this.buffers.get(oldId);
    if (buf) {
      this.buffers.delete(oldId);
      this.buffers.set(newId, buf);
    }

    // 2. Промис декодирования (может быть ещё в полёте)
    const promise = this._decodePromises.get(oldId);
    if (promise) {
      this._decodePromises.delete(oldId);
      this._decodePromises.set(newId, promise);
    }

    // 3. Мутабельный ref — чтобы завершение записи легло под новым id
    const ref = this._decodeRefs.get(oldId);
    if (ref) {
      this._decodeRefs.delete(oldId);
      this._decodeRefs.set(newId, ref);
      ref.id = newId;
    }

    // 4. Очередь — обновляем id всех совпадающих задач
    for (const entry of this._decodeQueue) {
      if (entry.id === oldId) entry.id = newId;
    }

    // 5. Активные проигрывания — чтобы stop/setPan/setPitch по новому
    //    имени продолжали их находить.
    for (const e of this.playing.values()) {
      if (e.name === oldId) e.name = newId;
    }

    this._emitStateChange();
  }

  // ============================================================
  // Playback
  // ============================================================

  play({ id, name, volume = 1, loop = false, pan = 0, pitch = 1 }) {
    if (!this._enabled) return null;
    const ctx = this._ensureContext();
    if (!ctx) return null;

    // Защита от NaN/пустых значений: если действие получило '' или
    // undefined, Number(...) даст 0 или NaN — это превратит звук
    // в тишину. Откатываемся на разумные дефолты.
    if (!Number.isFinite(volume)) volume = 1;
    if (!Number.isFinite(pan))    pan    = 0;
    if (!Number.isFinite(pitch))  pitch  = 1;

    const buffer = this.buffers.get(id);
    if (!buffer) return null;

    // Если контекст ещё suspended (первый PlaySound в первом тике после
    // клика Play, пока resume() не завершился) — не выходим. WebAudio
    // поставит source в очередь и проиграет его, как только контекст
    // перейдёт в running.
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = !!loop;
    source.playbackRate.value = clamp(pitch, 0.1, 4);

    const gain = ctx.createGain();
    gain.gain.value = clamp(volume, 0, 1);

    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);

    const playbackId = this._nextPlaybackId++;
    const entry = { name, source, gain, panner };

    source.onended = () => {
      const stillTracked = this.playing.get(playbackId) === entry;
      if (stillTracked) {
        this.playing.delete(playbackId);
        if (!entry._manualStop) {
          this._endedBuffer.push(name);
        }
      }
      try { source.disconnect(); } catch {}
      try { gain.disconnect(); }   catch {}
      try { panner.disconnect(); } catch {}
    };

    this.playing.set(playbackId, entry);
    source.start();
    return playbackId;
  }

  stop(name) {
    for (const [id, e] of this.playing) {
      if (e.name !== name) continue;
      e._manualStop = true;
      this.playing.delete(id);
      try { e.source.stop(); } catch {}
      try { e.source.disconnect(); } catch {}
      try { e.gain.disconnect(); }   catch {}
      try { e.panner.disconnect(); } catch {}
    }
  }

  stopAll() {
    for (const [id, e] of this.playing) {
      e._manualStop = true;
      this.playing.delete(id);
      try { e.source.stop(); } catch {}
      try { e.source.disconnect(); } catch {}
      try { e.gain.disconnect(); }   catch {}
      try { e.panner.disconnect(); } catch {}
    }
    this._endedBuffer.length = 0;
  }

  isPlaying(name) {
    for (const e of this.playing.values()) {
      if (e.name === name) return true;
    }
    return false;
  }

  countPlaying(name) {
    let n = 0;
    for (const e of this.playing.values()) if (e.name === name) n++;
    return n;
  }

  // ============================================================
  // Per-playback controls
  // ============================================================

  setMasterVolume(v) {
    if (!Number.isFinite(v)) return;
    this._masterVolume = clamp(v, 0, 1);
    if (this.masterGain) {
      this.masterGain.gain.value = this._masterVolume;
    }
  }

  getMasterVolume() { return this._masterVolume; }

  setPan(name, pan) {
    if (!Number.isFinite(pan)) return;
    const p = clamp(pan, -1, 1);
    for (const e of this.playing.values()) {
      if (e.name !== name) continue;
      try { e.panner.pan.value = p; } catch {}
    }
  }

  setPitch(name, pitch) {
    if (!Number.isFinite(pitch)) return;
    const p = clamp(pitch, 0.1, 4);
    for (const e of this.playing.values()) {
      if (e.name !== name) continue;
      try { e.source.playbackRate.value = p; } catch {}
    }
  }

  // ============================================================
  // Fades
  // ============================================================

  fadeIn(name, duration, targetVolume = 1) {
    if (!this.ctx) return;
    const d = Number.isFinite(duration) ? Math.max(0.001, duration) : 1;
    const v = Number.isFinite(targetVolume)
      ? clamp(targetVolume, 0, 1)
      : 1;
    const now = this.ctx.currentTime;
    for (const e of this.playing.values()) {
      if (e.name !== name) continue;
      const g = e.gain.gain;
      try {
        // cancelAndHoldAtTime сохраняет текущее интерполированное значение
        // и отменяет только будущую автоматизацию. Это единственный
        // надёжный способ взять «текущую» точку для ramp'а — обычный
        // cancelScheduledValues + g.value может вернуть запланированную,
        // а не реальную текущую величину.
        if (typeof g.cancelAndHoldAtTime === 'function') {
          g.cancelAndHoldAtTime(now);
        } else {
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
        }
        g.linearRampToValueAtTime(v, now + d);
      } catch {}
    }
  }

  fadeOut(name, duration) {
    if (!this.ctx) return;
    const d = Number.isFinite(duration) ? Math.max(0.001, duration) : 1;
    const now = this.ctx.currentTime;
    for (const [id, e] of this.playing) {
      if (e.name !== name) continue;
      const g = e.gain.gain;
      try {
        if (typeof g.cancelAndHoldAtTime === 'function') {
          g.cancelAndHoldAtTime(now);
        } else {
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
        }
        g.linearRampToValueAtTime(0, now + d);
      } catch {}
      e._manualStop = true;
      try { e.source.stop(now + d + 0.02); } catch {}
      this.playing.delete(id);
    }
  }

  // ============================================================
  // Events
  // ============================================================

  drainEnded() {
    if (this._endedBuffer.length === 0) return EMPTY;
    const out = this._endedBuffer;
    this._endedBuffer = [];
    return out;
  }

  clear() {
    this.stopAll();
    this.buffers.clear();
    this._decodeQueue.length = 0;
    this._decodePromises.clear();
    this._decodeRefs.clear();
    this._emitStateChange();
  }
}

const EMPTY = [];

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}