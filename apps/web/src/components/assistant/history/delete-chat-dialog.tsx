import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type DeleteChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeleteChatDialog({
  open,
  onOpenChange,
  onConfirm,
}: DeleteChatDialogProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("workspace:assistant.history.deleteTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("workspace:assistant.history.deleteDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" size="sm" />}>
            {t("workspace:assistant.history.cancel")}
          </AlertDialogClose>
          <AlertDialogClose
            render={
              <Button variant="destructive" size="sm" onClick={onConfirm} />
            }
          >
            {t("workspace:assistant.history.deleteConfirm")}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
