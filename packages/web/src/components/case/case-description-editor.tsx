import {
	IconBold,
	IconCircleFilled,
	IconItalic,
	IconList,
	IconUnderline,
} from "@tabler/icons-react";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect } from "react";
import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";
import "#/components/case/case-description-editor.css";

const TEXT_COLORS = [
	{ label: "Green", value: "var(--case-editor-green)" },
	{ label: "Red", value: "var(--case-editor-red)" },
	{ label: "Blue", value: "var(--case-editor-blue)" },
] as const;

const editorExtensions = [StarterKit, TextStyle, Color];

export function CaseDescriptionEditor({
	value,
	onChange,
	invalid,
}: {
	value: string;
	onChange: (value: string) => void;
	invalid: boolean;
}) {
	const editor = useEditor({
		extensions: editorExtensions,
		content: toEditorContent(value),
		immediatelyRender: false,
		editorProps: {
			attributes: {
				id: "case-description",
				role: "textbox",
				"aria-label": "Description",
				"aria-multiline": "true",
			},
		},
		onUpdate: ({ editor: updatedEditor }) => {
			const html = updatedEditor.getHTML();
			onChange(html === "<p></p>" ? "" : html);
		},
	});

	const editorState = useEditorState({
		editor,
		selector: ({ editor: currentEditor }) => ({
			bold: currentEditor?.isActive("bold") ?? false,
			italic: currentEditor?.isActive("italic") ?? false,
			underline: currentEditor?.isActive("underline") ?? false,
			bulletList: currentEditor?.isActive("bulletList") ?? false,
			colors: TEXT_COLORS.map(
				({ value: color }) =>
					currentEditor?.isActive("textStyle", { color }) ?? false,
			),
		}),
	});

	useEffect(() => {
		if (!editor) {
			return;
		}

		const nextContent = toEditorContent(value);
		if (editor.getHTML() !== nextContent) {
			editor.commands.setContent(nextContent, { emitUpdate: false });
		}
	}, [editor, value]);

	useEffect(() => {
		if (!editor) {
			return;
		}

		if (invalid) {
			editor.view.dom.setAttribute("aria-invalid", "true");
		} else {
			editor.view.dom.removeAttribute("aria-invalid");
		}
	}, [editor, invalid]);

	return (
		<div
			className={cn(
				"case-description-editor overflow-hidden rounded-lg border border-input bg-background shadow-xs has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
				invalid && "border-destructive ring-3 ring-destructive/20",
			)}
		>
			<div
				className="flex min-h-11 flex-wrap items-center gap-0.5 border-b bg-muted/20 px-2 py-1"
				role="toolbar"
				aria-label="Description formatting"
			>
				<FormatButton
					label="Bold"
					pressed={editorState?.bold ?? false}
					disabled={!editor}
					onClick={() => editor?.chain().focus().toggleBold().run()}
				>
					<IconBold />
				</FormatButton>
				<FormatButton
					label="Italic"
					pressed={editorState?.italic ?? false}
					disabled={!editor}
					onClick={() => editor?.chain().focus().toggleItalic().run()}
				>
					<IconItalic />
				</FormatButton>
				<FormatButton
					label="Underline"
					pressed={editorState?.underline ?? false}
					disabled={!editor}
					onClick={() => editor?.chain().focus().toggleUnderline().run()}
				>
					<IconUnderline />
				</FormatButton>
				<FormatButton
					label="Bullet list"
					pressed={editorState?.bulletList ?? false}
					disabled={!editor}
					onClick={() => editor?.chain().focus().toggleBulletList().run()}
				>
					<IconList />
				</FormatButton>

				<span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

				{TEXT_COLORS.map((color, index) => {
					const pressed = editorState?.colors[index] ?? false;
					return (
						<FormatButton
							key={color.label}
							label={`${color.label} text`}
							pressed={pressed}
							disabled={!editor}
							onClick={() => {
								if (!editor) {
									return;
								}
								const chain = editor.chain().focus();
								if (editor.isActive("textStyle", { color: color.value })) {
									chain.unsetColor().run();
								} else {
									chain.setColor(color.value).run();
								}
							}}
						>
							<IconCircleFilled
								style={pressed ? undefined : { color: color.value }}
							/>
						</FormatButton>
					);
				})}
			</div>

			<div className="relative">
				{!value && (
					<p className="pointer-events-none absolute top-3.5 left-4 text-sm text-muted-foreground">
						Add the context someone needs before working on this case.
					</p>
				)}
				<EditorContent editor={editor} />
			</div>
		</div>
	);
}

function FormatButton({
	label,
	pressed,
	...props
}: Omit<React.ComponentProps<typeof Button>, "aria-label" | "title"> & {
	label: string;
	pressed: boolean;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			className="text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
			{...props}
		/>
	);
}

function toEditorContent(value: string) {
	if (!value) {
		return "";
	}

	if (value.startsWith("<")) {
		return value;
	}

	return `<p>${escapeHtml(value).replaceAll("\n", "<br>")}</p>`;
}

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}
