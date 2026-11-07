import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
import type { FeatureHealth } from "@/fetchers/feature/types";
import { FeatureHealthValue, featureHealthKeys } from "./feature-health";

export function FeatureHealthSelect({
  value,
  disabled,
  onChange,
}: {
  value: FeatureHealth;
  disabled?: boolean;
  onChange: (value: FeatureHealth) => void;
}) {
  const { t } = useTranslation();
  return (
    <Menu>
      <MenuTrigger
        render={<Button type="button" size="sm" variant="outline" />}
        disabled={disabled}
        aria-label={`${t("tasks:features.workspace.healthLabel")}: ${t(featureHealthKeys[value])}`}
        className="shrink-0 gap-1.5"
      >
        <FeatureHealthValue health={value} />
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup align="end" className="w-44">
        <MenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (
              !disabled &&
              (next === "on-track" ||
                next === "at-risk" ||
                next === "off-track")
            )
              onChange(next);
          }}
        >
          {(["on-track", "at-risk", "off-track"] as const).map((health) => (
            <MenuRadioItem
              key={health}
              value={health}
              closeOnClick
              disabled={disabled}
            >
              <FeatureHealthValue health={health} />
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
