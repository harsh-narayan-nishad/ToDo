"use client";

/**
 * Pacewise's standard wheel loader (Pacewise/components/ui/loaders/MediconnectSpinner.tsx): twelve blades in a circle
 * fading one after another. Same sizes, colour and timing, written as plain CSS because this app has no styled-components.
 * It centres itself in the nearest positioned parent, so wrap it in a `relative` box with a height.
 */
const CSS = `.mc-spinner{font-size:28px;position:absolute;left:0;right:0;top:0;bottom:0;margin:auto;display:inline-block;width:1em;height:1em}
.mc-spinner .mc-blade{position:absolute;left:.4629em;bottom:0;width:.074em;height:.2777em;border-radius:.0555em;background-color:transparent;transform-origin:center -.2222em;animation:mc-spinner-fade 1s infinite linear}
.mc-spinner .mc-blade:nth-child(1){animation-delay:0.0s;transform:rotate(0deg)}
.mc-spinner .mc-blade:nth-child(2){animation-delay:0.083s;transform:rotate(30deg)}
.mc-spinner .mc-blade:nth-child(3){animation-delay:0.166s;transform:rotate(60deg)}
.mc-spinner .mc-blade:nth-child(4){animation-delay:0.249s;transform:rotate(90deg)}
.mc-spinner .mc-blade:nth-child(5){animation-delay:0.332s;transform:rotate(120deg)}
.mc-spinner .mc-blade:nth-child(6){animation-delay:0.415s;transform:rotate(150deg)}
.mc-spinner .mc-blade:nth-child(7){animation-delay:0.498s;transform:rotate(180deg)}
.mc-spinner .mc-blade:nth-child(8){animation-delay:0.581s;transform:rotate(210deg)}
.mc-spinner .mc-blade:nth-child(9){animation-delay:0.664s;transform:rotate(240deg)}
.mc-spinner .mc-blade:nth-child(10){animation-delay:0.747s;transform:rotate(270deg)}
.mc-spinner .mc-blade:nth-child(11){animation-delay:0.83s;transform:rotate(300deg)}
.mc-spinner .mc-blade:nth-child(12){animation-delay:0.913s;transform:rotate(330deg)}
@keyframes mc-spinner-fade{0%{background-color:#69717d}100%{background-color:transparent}}`;

export function WheelSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mc-spinner">
        {Array.from({ length: 12 }, (_, i) => <div key={i} className="mc-blade" />)}
      </div>
    </div>
  );
}

/** The wheel centred in a block of its own, for a panel that is still loading. */
export function PanelLoader({ label }: { label?: string }) {
  return <div className="relative h-32"><WheelSpinner label={label} /></div>;
}
