import type { Ref } from "react";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxStatus,
} from "@/components/ui/combobox";
import type { HolidayOption } from "@/fetchers/time-off/types";

// The first option's code: no country, or the whole country.
const NONE = "";

type HolidayOptionComboboxProps = {
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  options: readonly HolidayOption[];
  // The first option, which picks nothing.
  noneLabel: string;
  // A code from the options; null picks the first option.
  value: string | null;
  placeholder: string;
  emptyText: string;
  // Loading or error text shown above the options.
  status?: string | null;
  disabled?: boolean;
  onChange: (code: string | null) => void;
};

// A searchable list of holiday calendar countries or regions.
export function HolidayOptionCombobox({
  id,
  inputRef,
  options,
  noneLabel,
  value,
  placeholder,
  emptyText,
  status,
  disabled,
  onChange,
}: HolidayOptionComboboxProps) {
  const none = { code: NONE, name: noneLabel };
  const selected = options.find((option) => option.code === value) ?? none;

  return (
    <Combobox
      items={[none, ...options]}
      value={selected}
      disabled={disabled}
      onValueChange={(next) =>
        onChange(next && next.code !== NONE ? next.code : null)
      }
      itemToStringLabel={(option) => option.name}
      isItemEqualToValue={(option, current) => option.code === current.code}
    >
      <ComboboxInput id={id} ref={inputRef} placeholder={placeholder} />
      <ComboboxPopup>
        <ComboboxStatus>{status ?? null}</ComboboxStatus>
        <ComboboxEmpty>{status ? null : emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(option: HolidayOption) => (
            <ComboboxItem key={option.code || "none"} value={option}>
              {option.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
