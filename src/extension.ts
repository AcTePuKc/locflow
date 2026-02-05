import * as vscode from "vscode";

/**
 * Global state for decorations and status bar items to manage lifecycle
 * across configuration changes and editor swaps.
 */
let tagDecorationType: vscode.TextEditorDecorationType;
let variableDecorationType: vscode.TextEditorDecorationType;
let profileItem: vscode.StatusBarItem;
let charCountItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {

  // Initialize decoration styles from current configuration
  createStyles();

  // Register all UI commands
  context.subscriptions.push(
    vscode.commands.registerCommand("tagButtons.insertNewline", () => insertTag("newline", false)),
    vscode.commands.registerCommand("tagButtons.insertColorWhite", () => insertTag("white", true)),
    vscode.commands.registerCommand("tagButtons.insertColorRed", () => insertTag("red", true)),
    vscode.commands.registerCommand("tagButtons.insertColorGreen", () => insertTag("green", true)),
    vscode.commands.registerCommand("tagButtons.insertColorBlue", () => insertTag("blue", true)),
    vscode.commands.registerCommand("tagButtons.insertColorYellow", () => insertTag("yellow", true)),

    vscode.commands.registerCommand("tagButtons.toggleProfile", async () => {
      const cfg = vscode.workspace.getConfiguration("tagButtons");
      const current = cfg.get<string>("profile", "raw");
      const next = current === "raw" ? "normalized" : "raw";

      await cfg.update("profile", next, vscode.ConfigurationTarget.Global);
      updateStatusBar();
      triggerUpdateDecorations();
    }),

    vscode.commands.registerCommand("tagButtons.insertTagMenu", showQuickMenu)
  );

  // Setup Status Bar Items
  profileItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  profileItem.command = "tagButtons.toggleProfile";
  context.subscriptions.push(profileItem);

  charCountItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(charCountItem);

  makeStatusButton(context, "$(list-flat) Tags", "Show Tag Menu", "tagButtons.insertTagMenu", 101);
  updateStatusBar();

  /**
   * Listen for configuration changes to allow real-time UI updates
   * (e.g., changing highlight colors) without requiring a reload.
   */
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("tagButtons.tagColor") || e.affectsConfiguration("tagButtons.variableColor")) {
        createStyles();
        triggerUpdateDecorations();
      }
    })
  );

  let activeEditor = vscode.window.activeTextEditor;
  let timeout: NodeJS.Timeout | undefined = undefined;

  /**
   * Heavy task: Highlighting tags across the whole document.
   * We debounce this to avoid freezing the UI on large files.
   */
  function updateDecorations() {
    if (!activeEditor || !activeEditor.document.fileName.toLowerCase().endsWith('.tsv')) {
      return;
    }

    const text = activeEditor.document.getText();
    const tags: vscode.DecorationOptions[] = [];
    const vars: vscode.DecorationOptions[] = [];

    const tagEx = /\[[A-Z0-9_]+\]|~[a-z0-9]+~/gi;
    const varEx = /%[a-z]|{\d+}|<[^>\n]+>/gi;

    let match;
    while ((match = tagEx.exec(text))) {
      tags.push({ range: new vscode.Range(activeEditor.document.positionAt(match.index), activeEditor.document.positionAt(match.index + match[0].length)) });
    }
    while ((match = varEx.exec(text))) {
      vars.push({ range: new vscode.Range(activeEditor.document.positionAt(match.index), activeEditor.document.positionAt(match.index + match[0].length)) });
    }

    activeEditor.setDecorations(tagDecorationType, tags);
    activeEditor.setDecorations(variableDecorationType, vars);
  }

  /**
   * Light task: Update character count.
   * This runs instantly as it only processes the selected string.
   */
  function updateCharCount() {
    if (!activeEditor) {
      charCountItem.hide();
      return;
    }
    const selection = activeEditor.selection;
    if (!selection.isEmpty) {
      const selectedText = activeEditor.document.getText(selection);
      const cleanText = selectedText.replace(/\[[A-Z0-9_]+\]|~[a-z0-9]+~/gi, '');
      charCountItem.text = `Visible: ${cleanText.length} (Total: ${selectedText.length})`;
      charCountItem.show();
    } else {
      charCountItem.hide();
    }
  }


  /**
   * Debounces the heavy decoration task.
   */
  function triggerUpdateDecorations() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    // 300ms delay is a sweet spot for 65k+ lines
    timeout = setTimeout(updateDecorations, 300);
  }

  // Immediate update for selection changes
  vscode.window.onDidChangeTextEditorSelection(() => {
    updateCharCount();
    // We don't trigger decorations on arrow key movement anymore to save CPU
  }, null, context.subscriptions);

  // Debounced update for text changes
  vscode.workspace.onDidChangeTextDocument(e => {
    if (activeEditor && e.document === activeEditor.document) {
      triggerUpdateDecorations();
    }
  }, null, context.subscriptions);

  vscode.window.onDidChangeActiveTextEditor(editor => {
    activeEditor = editor;
    if (editor) { triggerUpdateDecorations(); }
  }, null, context.subscriptions);

  if (activeEditor) { triggerUpdateDecorations(); }
}

/**
 * Creates decoration types. Disposes of existing ones first to prevent 
 * memory leaks or duplicate styling when settings are updated.
 */
function createStyles() {
  if (tagDecorationType) { tagDecorationType.dispose(); }
  if (variableDecorationType) { variableDecorationType.dispose(); }

  const cfg = vscode.workspace.getConfiguration("tagButtons");
  const tagColor = cfg.get<string>("tagColor", "#2188ff");
  const varColor = cfg.get<string>("variableColor", "#ce9178");

  tagDecorationType = vscode.window.createTextEditorDecorationType({
    color: tagColor,
    fontWeight: 'bold',
    backgroundColor: 'rgba(33, 136, 255, 0.05)'
  });

  variableDecorationType = vscode.window.createTextEditorDecorationType({
    color: varColor,
    fontWeight: 'bold',
    textDecoration: 'underline'
  });
}

function getActiveProfile(): any | null {
  const cfg = vscode.workspace.getConfiguration("tagButtons");
  const profiles = cfg.get<any>("profiles");
  const currentName = cfg.get<string>("profile", "raw");

  if (!profiles || !profiles[currentName]) { return null; }
  return profiles[currentName];
}

/**
 * Handles the actual insertion of tags into the editor.
 * If text is selected and a color tag is chosen, it wraps the text and adds a reset (white) tag.
 */
function insertTag(key: string, isColor: boolean) {
  const editor = vscode.window.activeTextEditor;
  const profile = getActiveProfile();
  if (!editor || !profile) { return; }

  const tag = (key === "newline") ? profile.newline : profile.colors?.[key];
  if (!tag) { return; }

  editor.edit(editBuilder => {
    editor.selections.forEach(sel => {
      if (isColor && !sel.isEmpty && key !== "white") {
        const resetTag = profile.colors?.["white"] || "";
        editBuilder.replace(sel, `${tag}${editor.document.getText(sel)}${resetTag}`);
      } else {
        editBuilder.insert(sel.active, tag);
      }
    });
  });
}

async function showQuickMenu() {
  const p = getActiveProfile();
  if (!p) { return; }

  const items = [
    { label: "$(symbol-key) Newline", val: "newline", isColor: false, desc: p.newline },
    { label: "$(symbol-color) White", val: "white", isColor: true, desc: p.colors?.white },
    { label: "$(symbol-color) Red", val: "red", isColor: true, desc: p.colors?.red },
    { label: "$(symbol-color) Green", val: "green", isColor: true, desc: p.colors?.green },
    { label: "$(symbol-color) Blue", val: "blue", isColor: true, desc: p.colors?.blue },
    { label: "$(symbol-color) Yellow", val: "yellow", isColor: true, desc: p.colors?.yellow }
  ].filter(i => i.desc);

  const pick = await vscode.window.showQuickPick(items.map(i => ({
    label: i.label,
    description: i.desc,
    action: () => insertTag(i.val, i.isColor)
  })), { title: "LocFlow: Insert Tag" });

  if (pick) { pick.action(); }
}

function updateStatusBar() {
  const p = vscode.workspace.getConfiguration("tagButtons").get("profile", "raw");
  profileItem.text = `$(gear) Profile: ${p}`;
  profileItem.show();
}

function makeStatusButton(ctx: vscode.ExtensionContext, text: string, tooltip: string, command: string, priority: number) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
  item.text = text; item.tooltip = tooltip; item.command = command; item.show();
  ctx.subscriptions.push(item);
}

export function deactivate() {
  if (tagDecorationType) { tagDecorationType.dispose(); }
  if (variableDecorationType) { variableDecorationType.dispose(); }
}