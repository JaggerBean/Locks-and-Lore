import { presetValues, tuningLabel } from "./mechanism.mjs";

/** Keep the Foundry console and independent workshop's tuning controls identical. */
export function bindTuning(root, onChange = () => {}) {
  const sliders = ["shiftingRate", "lockSize"].map(name => root.querySelector(`[name='${name}']`)).filter(Boolean);
  const refresh = () => {
    for (const slider of sliders) {
      const label = root.querySelector(`[data-tuning-label='${slider.name}']`);
      if (label) label.textContent = `${tuningLabel(slider.value)} · ${Math.round(Number(slider.value))}/100`;
    }
  };
  root.querySelectorAll("[data-pair]").forEach(range=>range.addEventListener("input",()=>{
    const input=root.querySelector(`[name='${range.dataset.pair}']`);
    input.value=range.value;
    input.dispatchEvent(new Event("input",{bubbles:true}));
  }));
  root.addEventListener("input",event=>{
    if (!event.target.name) return;
    const range=root.querySelector(`[data-pair='${event.target.name}']`);
    if(range)range.value=event.target.value;
    refresh();onChange();
  });
  root.addEventListener("change",event=>{if(event.target.name && event.target.name!=="difficulty")onChange();});
  root.querySelector("[name='difficulty']")?.addEventListener("change", event => {
    const values=presetValues(event.currentTarget.value);
    Object.entries(values).forEach(([name,value])=>{
      const input=root.querySelector(`[name='${name}']`),range=root.querySelector(`[data-pair='${name}']`);
      if(input)input.value=value;if(range)range.value=value;
    });
    refresh();onChange();
  });
  refresh();
}
