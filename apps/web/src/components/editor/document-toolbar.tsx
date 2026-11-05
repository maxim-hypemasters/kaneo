import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  ChevronDown,
  Code,
  Columns3,
  FileUp,
  Image,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  MoreHorizontal,
  Quote,
  Redo2,
  Undo2,
  Video,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/ui/toolbar";
import { cn } from "@/lib/cn";

type DocumentToolbarProps = {
  editor: Editor;
  disabled: boolean;
  canUpload: boolean;
  onUpload: (imagesOnly: boolean) => void;
  onLink: () => void;
  onEmbed: () => void;
};

export function DocumentToolbar({
  editor,
  disabled,
  canUpload,
  onUpload,
  onLink,
  onEmbed,
}: DocumentToolbarProps) {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: ({ editor: active }) => ({
      bold: active.isActive("bold"),
      italic: active.isActive("italic"),
      bulletList: active.isActive("bulletList"),
      orderedList: active.isActive("orderedList"),
      heading: active.isActive("heading")
        ? Number(active.getAttributes("heading").level)
        : 0,
      canUndo: active.can().undo(),
      canRedo: active.can().redo(),
    }),
  });
  const styleLabels = [
    t("common:documentEditor.paragraph"),
    t("common:documentEditor.heading1"),
    t("common:documentEditor.heading2"),
    t("common:documentEditor.heading3"),
  ];
  const formatting = [
    {
      label: t("common:documentEditor.bold"),
      icon: Bold,
      active: state.bold,
      mobileSecondary: false,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: t("common:documentEditor.italic"),
      icon: Italic,
      active: state.italic,
      mobileSecondary: false,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: t("common:documentEditor.bulletedList"),
      icon: List,
      active: state.bulletList,
      mobileSecondary: true,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: t("common:documentEditor.numberedList"),
      icon: ListOrdered,
      active: state.orderedList,
      mobileSecondary: true,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
  ];
  const insertions = [
    {
      label: t("common:documentEditor.checklist"),
      icon: ListTodo,
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: t("common:documentEditor.table"),
      icon: Columns3,
      run: () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      label: t("common:documentEditor.quote"),
      icon: Quote,
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: t("common:documentEditor.codeBlock"),
      icon: Code,
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    { label: t("common:documentEditor.embed"), icon: Video, run: onEmbed },
  ];

  return (
    <Toolbar
      aria-label={t("common:documentEditor.toolbar")}
      className="flex-wrap items-center gap-1 rounded-lg border-0 bg-transparent p-0"
    >
      <ToolbarGroup>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <ToolbarButton
                render={<Button type="button" size="sm" variant="ghost" />}
              />
            }
            disabled={disabled}
          >
            {styleLabels[state.heading]}
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {styleLabels.map((label, index) => (
              <DropdownMenuItem
                key={label}
                onClick={() =>
                  index === 0
                    ? editor.chain().focus().setParagraph().run()
                    : editor
                        .chain()
                        .focus()
                        .setHeading({ level: index as 1 | 2 | 3 })
                        .run()
                }
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>
      <ToolbarSeparator orientation="vertical" className="max-sm:hidden" />
      <ToolbarGroup>
        {formatting.map((action) => (
          <ToolbarButton
            key={action.label}
            render={<Button type="button" size="icon-sm" variant="ghost" />}
            aria-label={action.label}
            title={action.label}
            aria-pressed={action.active}
            disabled={disabled}
            className={cn(
              action.active && "bg-accent text-accent-foreground",
              action.mobileSecondary && "max-sm:hidden",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={action.run}
          >
            <action.icon className="size-4" />
          </ToolbarButton>
        ))}
        <ToolbarButton
          render={<Button type="button" size="icon-sm" variant="ghost" />}
          aria-label={t("common:documentEditor.link")}
          title={t("common:documentEditor.link")}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onLink}
        >
          <Link2 className="size-4" />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarSeparator orientation="vertical" className="max-sm:hidden" />
      <ToolbarGroup>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <ToolbarButton
                render={<Button type="button" size="sm" variant="ghost" />}
              />
            }
            disabled={disabled}
          >
            {t("common:documentEditor.insert")}
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {insertions.map((action) => (
              <DropdownMenuItem key={action.label} onClick={action.run}>
                <action.icon />
                {action.label}
              </DropdownMenuItem>
            ))}
            {canUpload && (
              <>
                <DropdownMenuItem onClick={() => onUpload(true)}>
                  <Image />
                  {t("common:documentEditor.image")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onUpload(false)}>
                  <FileUp />
                  {t("common:documentEditor.file")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>
      <ToolbarGroup className="ms-auto max-sm:hidden">
        <ToolbarButton
          render={<Button type="button" size="icon-sm" variant="ghost" />}
          aria-label={t("common:documentEditor.undo")}
          title={t("common:documentEditor.undo")}
          disabled={disabled || !state.canUndo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          render={<Button type="button" size="icon-sm" variant="ghost" />}
          aria-label={t("common:documentEditor.redo")}
          title={t("common:documentEditor.redo")}
          disabled={disabled || !state.canRedo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="size-4" />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup className="ms-auto sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <ToolbarButton
                render={<Button type="button" size="icon-sm" variant="ghost" />}
              />
            }
            disabled={disabled}
            aria-label={t("common:breadcrumb.more")}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {formatting
              .filter((action) => action.mobileSecondary)
              .map((action) => (
                <DropdownMenuItem key={action.label} onClick={action.run}>
                  <action.icon />
                  {action.label}
                </DropdownMenuItem>
              ))}
            <DropdownMenuItem
              disabled={!state.canUndo}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <Undo2 />
              {t("common:documentEditor.undo")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!state.canRedo}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <Redo2 />
              {t("common:documentEditor.redo")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>
    </Toolbar>
  );
}
