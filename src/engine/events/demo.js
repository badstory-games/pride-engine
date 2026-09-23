/** Дефолтный event sheet: On Space → ApplyImpulse(0, -800) ко всем динамическим. */
export function defaultEventSheet() {
  return {
    name: 'EventSheet 1',
    events: [
      {
        id: 1,
        conditions: [
          { type: 'OnKeyPressed', params: { key: 'Space' } },
        ],
        actions: [
          { type: 'ApplyImpulse', params: { target: '*', ix: 0, iy: -800 } },
        ],
        children: [],
        disabled: false,
      },
    ],
  };
}