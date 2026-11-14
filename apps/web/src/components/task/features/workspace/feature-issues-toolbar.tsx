import { Link2, Plus } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

export function FeatureIssuesToolbar({
  search,
  archived,
  selectedCount,
  createTypes,
  canEdit,
  onSearch,
  onArchived,
  onCreate,
  onLink,
  onClearSelection,
}: {
  search: string;
  archived: boolean;
  selectedCount: number;
  // Kinds of work the role may create here.
  createTypes: readonly ("task" | "bug")[];
  canEdit: boolean;
  onSearch: (search: string) => void;
  onArchived: (include: boolean) => void;
  onCreate: (type: "task" | "bug") => void;
  onLink: () => void;
  onClearSelection: () => void;
}) {
  const { t } = useTranslation();
  const selectedAction = useRef(false);
  const canCreate = createTypes.length > 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          size="sm"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t("tasks:features.workspace.issues.search")}
          aria-label={t("tasks:features.workspace.issues.search")}
          className="min-w-32 flex-1"
        />
        {(canCreate || canEdit) && (
          <Menu
            onOpenChange={(open) => {
              if (open) selectedAction.current = false;
            }}
          >
            <MenuTrigger
              render={<Button type="button" size="sm" variant="outline" />}
            >
              <Plus />
              {t("tasks:createMenu.new")}
            </MenuTrigger>
            <MenuPopup
              align="end"
              className="w-64"
              finalFocus={() => !selectedAction.current}
            >
              {createTypes.map((type) => (
                <MenuItem
                  key={type}
                  onClick={() => {
                    selectedAction.current = true;
                    onCreate(type);
                  }}
                >
                  <TaskTypeGlyph type={type} decorative />
                  {t(
                    type === "task"
                      ? "tasks:createMenu.newTask"
                      : "tasks:createMenu.newBug",
                  )}
                </MenuItem>
              ))}
              {canCreate && canEdit && <MenuSeparator />}
              {canEdit && (
                <MenuItem
                  onClick={() => {
                    selectedAction.current = true;
                    onLink();
                  }}
                >
                  <Link2 />
                  {t("tasks:features.workspace.issues.linkExisting")}
                </MenuItem>
              )}
            </MenuPopup>
          </Menu>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={archived}
            onCheckedChange={(value) => onArchived(value)}
          />
          {t("tasks:features.workspace.issues.includeArchived")}
        </label>
        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <span>
              {t("tasks:features.workspace.issues.selected", {
                count: selectedCount,
              })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onClearSelection}
            >
              {t("tasks:features.workspace.issues.clearSelection")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
