const RADIUS_OPTIONS_KM = [5, 10, 25, 50, 100];

export function RadiusSelect({
  value,
  onChange,
  hidden,
}: {
  value: number;
  onChange: (radiusKm: number) => void;
  hidden: boolean;
}) {
  return (
    <label id="radius-label" hidden={hidden}>
      Within
      <select
        id="radius-select"
        aria-label="Search radius"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {RADIUS_OPTIONS_KM.map((km) => (
          <option key={km} value={km}>
            {km} km
          </option>
        ))}
      </select>
    </label>
  );
}
