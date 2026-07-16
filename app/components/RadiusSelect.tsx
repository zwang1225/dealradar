import { Select, Text } from "@radix-ui/themes";

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
  if (hidden) return null;

  return (
    <Text as="label" id="radius-label" size="2" className="radius-label">
      Within{" "}
      <Select.Root value={String(value)} onValueChange={(next) => onChange(Number(next))} size="2">
        <Select.Trigger aria-label="Search radius" />
        <Select.Content>
          {RADIUS_OPTIONS_KM.map((km) => (
            <Select.Item key={km} value={String(km)}>
              {km} km
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Text>
  );
}
