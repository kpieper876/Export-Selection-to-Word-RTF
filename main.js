// Export Selection to Word (RTF)
// - Preserves headings, inline styles, nested lists
// - Renders Markdown pipe tables with borders & alignment (Word-safe)
// - Strips Markdown links, wikilinks, and visible URLs when enabled
// - No external tools; outputs .rtf readable by Word
//
// Place beside manifest.json in: .obsidian/plugins/selection-to-word-rtf/main.js

const {
  Plugin,
  Modal,
  Setting,
  SettingTab,
  ToggleComponent,
  Notice,
  MarkdownView
} = require('obsidian');

const DEFAULT_SETTINGS = {
  exportFolder: "",               // empty = same folder as source note
  stripLinks: true,               // remove links, wikilinks, visible URLs
  stripImages: true,
  stripCodeFences: true,
  keepInlineFormatting: true,     // bold/italic/underline/strike/mono
  headingSizeMap: { 1: 28, 2: 24, 3: 20, 4: 16, 5: 14, 6: 12 }, // pt
  indentSpacesPerLevel: 2,        // spaces = one nesting level
  indentTwipsPerLevel: 720,       // 720 twips ≈ 0.5"
  tableWidthTwips: 9000           // total table width (~6.25")
};

/* ---------------- UI ---------------- */

class ExportOptionsModal extends Modal {
  constructor(app, settings, onSubmit) {
    super(app);
    this.settings = JSON.parse(JSON.stringify(settings));
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Export selection to Word (RTF)" });

    const mkToggle = (label, key) => {
      const row = contentEl.createDiv({ cls: "stwr-row" });
      row.createEl("label", { text: label, cls: "stwr-label" }).style.marginRight = "0.75rem";
      new ToggleComponent(row).setValue(this.settings[key]).onChange(v => this.settings[key] = v);
    };

    mkToggle("Strip links (Markdown & wikilinks) and visible URLs", "stripLinks");
    mkToggle("Strip images", "stripImages");
    mkToggle("Strip code fences", "stripCodeFences");

    new Setting(contentEl)
      .setName("Keep inline formatting")
      .setDesc("Preserve **bold**, *italic*, __underline__, ~~strike~~, and `code`.")
      .addToggle(t => t.setValue(this.settings.keepInlineFormatting)
        .onChange(v => this.settings.keepInlineFormatting = v));

    new Setting(contentEl)
      .setName("Export folder (inside vault)")
      .setDesc("Leave blank to save next to the source note.")
      .addText(t => {
        t.setPlaceholder("e.g., Exports").setValue(this.settings.exportFolder || "");
        t.onChange(v => this.settings.exportFolder = v.trim());
      });

    new Setting(contentEl)
      .setName("Spaces per nesting level")
      .setDesc("How many leading spaces define one bullet level (default 2).")
      .addText(t => {
        t.inputEl.type = "number";
        t.setValue(String(this.settings.indentSpacesPerLevel ?? DEFAULT_SETTINGS.indentSpacesPerLevel));
        t.onChange(v => this.settings.indentSpacesPerLevel = Math.max(1, parseInt(v || "2", 10)));
      });

    new Setting(contentEl)
      .setName("Indent per level (twips)")
      .setDesc("720 twips ≈ 0.5 inch.")
      .addText(t => {
        t.inputEl.type = "number";
        t.setValue(String(this.settings.indentTwipsPerLevel ?? DEFAULT_SETTINGS.indentTwipsPerLevel));
        t.onChange(v => this.settings.indentTwipsPerLevel = Math.max(120, parseInt(v || "720", 10)));
      });

    new Setting(contentEl)
      .setName("Table width (twips)")
      .setDesc("Total width for tables (default 9000 ≈ 6.25\").")
      .addText(t => {
        t.inputEl.type = "number";
        t.setValue(String(this.settings.tableWidthTwips ?? DEFAULT_SETTINGS.tableWidthTwips));
        t.onChange(v => this.settings.tableWidthTwips = Math.max(2000, parseInt(v || "9000", 10)));
      });

    const btns = contentEl.createDiv({ cls: "stwr-buttons" });
    btns.style.marginTop = "1rem";
    btns.createEl("button", { text: "Export" }).addEventListener("click", async () => {
      this.close();
      this.onSubmit(this.settings);
    });
    const cancel = btns.createEl("button", { text: "Cancel" });
    cancel.style.marginLeft = "0.5rem";
    cancel.addEventListener("click", () => this.close());
  }
  onClose() { this.contentEl.empty(); }
}

class SelectionToWordRtfSettings extends SettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Export Selection to Word (RTF) — Settings" });

    new Setting(containerEl)
      .setName("Export folder (inside vault)")
      .setDesc("Leave blank to save next to the source note.")
      .addText(t => {
        t.setPlaceholder("e.g., Exports").setValue(this.plugin.settings.exportFolder || "");
        t.onChange(async v => { this.plugin.settings.exportFolder = v.trim(); await this.plugin.saveData(this.plugin.settings); });
      });

    const mkToggle = (name, desc, key) => {
      new Setting(containerEl).setName(name).setDesc(desc).addToggle(t => {
        t.setValue(this.plugin.settings[key]).onChange(async v => {
          this.plugin.settings[key] = v; await this.plugin.saveData(this.plugin.settings);
        });
      });
    };
    mkToggle("Strip links & visible URLs", "Remove Markdown links, wikilinks, and visible URLs; keep only visible labels.", "stripLinks");
    mkToggle("Strip images", "Remove Markdown image syntax.", "stripImages");
    mkToggle("Strip code fences", "Remove ```blocks``` and `inline` code.", "stripCodeFences");
    mkToggle("Keep inline formatting", "Preserve **bold**, *italic*, __underline__, ~~strike~~, and `code`.", "keepInlineFormatting");

    new Setting(containerEl)
      .setName("Spaces per nesting level")
      .setDesc("Leading spaces that define one list level.")
      .addText(t => {
        t.inputEl.type = "number";
        t.setValue(String(this.plugin.settings.indentSpacesPerLevel ?? DEFAULT_SETTINGS.indentSpacesPerLevel));
        t.onChange(async v => {
          this.plugin.settings.indentSpacesPerLevel = Math.max(1, parseInt(v || "2", 10));
          await this.plugin.saveData(this.plugin.settings);
        });
      });

    new Setting(containerEl)
      .setName("Indent per level (twips)")
      .setDesc("720 twips ≈ 0.5 inch.")
      .addText(t => {
        t.inputEl.type = "number";
        t.setValue(String(this.plugin.settings.indentTwipsPerLevel ?? DEFAULT_SETTINGS.indentTwipsPerLevel));
        t.onChange(async v => {
          this.plugin.settings.indentTwipsPerLevel = Math.max(120, parseInt(v || "720", 10));
          await this.plugin.saveData(this.plugin.settings);
        });
      });

    new Setting(containerEl)
      .setName("Table width (twips)")
      .setDesc("Total width for tables.")
      .addText(t => {
        t.inputEl.type = "number";
        t.setValue(String(this.plugin.settings.tableWidthTwips ?? DEFAULT_SETTINGS.tableWidthTwips));
        t.onChange(async v => {
          this.plugin.settings.tableWidthTwips = Math.max(2000, parseInt(v || "9000", 10));
          await this.plugin.saveData(this.plugin.settings);
        });
      });
  }
}

/* ---------------- Plugin ---------------- */

module.exports = class SelectionToWordRtfPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Always show prompt
    this.addCommand({
      id: "export-selection-to-rtf-prompt",
      name: "Export selection to Word (RTF)…",
      callback: () => this.openPromptAndExport()
    });

    this.addSettingTab(new SelectionToWordRtfSettings(this.app, this));
  }

  async openPromptAndExport() {
    new ExportOptionsModal(this.app, this.settings, async (opts) => {
      await this.saveData(opts);
      this.settings = opts;
      await this.exportWithSettings(opts);
    }).open();
  }

  async exportWithSettings(opts) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return new Notice("Open a Markdown note first.");

    // selection or whole note
    let md = view.editor.getSelection();
    if (!md || md.trim() === "") {
      const file = view.file;
      if (!file) return new Notice("No file to export.");
      md = await this.app.vault.read(file);
    }

    const file = view.file;
    const targetDir = await this.resolveTargetDir(file, opts.exportFolder);
    const safeBase = (file ? file.basename : "export").replace(/[\\/:*?"<>|]/g, "_");
    const targetPath = `${targetDir ? targetDir + "/" : ""}${safeBase} (export).rtf`;

    const rtf = this.mdToRtf(md, opts);

    try {
      await this.ensureFolder(targetDir);
      await this.app.vault.adapter.write(targetPath, rtf);
      new Notice(`Exported: ${targetPath}`);
    } catch (e) {
      console.error(e);
      new Notice("Failed to write RTF. See console (Ctrl+Shift+I).");
    }
  }

  async resolveTargetDir(srcFile, exportFolder) {
    if (exportFolder && exportFolder.length) return exportFolder.replace(/^\//, "").replace(/\/$/, "");
    return srcFile?.parent?.path || "";
  }
  async ensureFolder(path) {
    if (!path) return;
    const exists = await this.app.vault.adapter.exists(path);
    if (!exists) await this.app.vault.createFolder(path);
  }

  /* ---------------- Markdown → RTF ---------------- */

  mdToRtf(md, opts) {
    // Frontmatter
    md = md.replace(/^---\s*[\s\S]*?\s*---\s*\n?/, "");

    // Code
    if (opts.stripCodeFences) {
      md = md.replace(/```[\s\S]*?```/g, "");
      md = md.replace(/`([^`]+)`/g, "$1");
    }

    // Images
    if (opts.stripImages) {
      md = md.replace(/!\[[^\]]*]\([^)]*\)/g, "");
    }

    // Links & visible URLs
    if (opts.stripLinks) {
      // [label](url) -> label
      md = md.replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1");
      // <scheme:...> -> content
      md = md.replace(/<([a-z]+:[^>]+)>/gi, "$1");
      // Wikilinks
      md = md.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
      md = md.replace(/\[\[([^\]]+)\]\]/g, "$1");
      // Visible URLs
      md = md.replace(/\b(?:https?:\/\/|ftp:\/\/)[^\s<)]+/gi, "");
      md = md.replace(/\bwww\.[^\s<)]+/gi, "");
      md = md.replace(/\bmailto:[^\s<)]+/gi, "");
    } else {
      md = md.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2 ($1)");
      md = md.replace(/\[\[([^\]]+)\]\]/g, "$1");
      md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
      md = md.replace(/<([a-z]+:[^>]+)>/gi, "$1");
    }

    md = md.replace(/\r\n/g, "\n");
    const lines = md.split("\n");

    const r = [];
    r.push("{\\rtf1\\ansi\\deff0");
    r.push("{\\fonttbl{\\f0 Calibri;}{\\f1 Courier New;}}");
    r.push("\\fs24");

    // List state
    const orderedCounters = [];
    const indentSpaces = Math.max(1, opts.indentSpacesPerLevel || DEFAULT_SETTINGS.indentSpacesPerLevel);
    const twipsPerLevel = Math.max(120, opts.indentTwipsPerLevel || DEFAULT_SETTINGS.indentTwipsPerLevel);

    const resetLists = () => { orderedCounters.length = 0; };

    // --- Table helpers ---
    const isSeparator = (s) => {
      const line = s.trim();
      if (!/\|/.test(line)) return false;
      return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
    };

    const splitRow = (row) => {
      let s = row.trim();
      if (s.startsWith("|")) s = s.slice(1);
      if (s.endsWith("|")) s = s.slice(0, -1);
      return s.split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, "|").trim());
    };

    const isTableRow = (s) => {
      const line = s.trim();
      if (!/\|/.test(line)) return false;
      const parts = splitRow(line);
      return parts.length >= 2;
    };

    const parseAlign = (sepRowCells) => {
      return sepRowCells.map(cell => {
        const c = cell.replace(/\s+/g, "");
        const left  = c.startsWith(":");
        const right = c.endsWith(":");
        if (left && right) return "c";
        if (right) return "r";
        return "l";
      });
    };

    // borders applied before each \cellx
    const CELL_BORDERS = "\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10";

    const alignCode = (a) => (a === "c" ? "\\qc" : a === "r" ? "\\qr" : "\\ql");

    // Emit an RTF table with proper cell defs, borders, and padding (Word-safe)
    const emitTable = (blockRows, headerHasSeparator) => {
      if (blockRows.length === 0) return;

      let headerCells = null, bodyStart = 0, aligns = null;

      if (headerHasSeparator) {
        headerCells = splitRow(blockRows[0]);
        const sepCells = splitRow(blockRows[1]);
        aligns = parseAlign(sepCells);
        bodyStart = 2;
      } else {
        aligns = splitRow(blockRows[0]).map(() => "l");
        bodyStart = 0;
      }

      // Determine max column count across all rows
      let colCount = headerCells ? headerCells.length : 0;
      for (let k = bodyStart; k < blockRows.length; k++) {
        if (isSeparator(blockRows[k])) continue;
        const n = splitRow(blockRows[k]).length;
        if (n > colCount) colCount = n;
      }
      if (colCount < 1) colCount = 1;

      // Normalize header/aligns lengths
      if (headerCells && headerCells.length < colCount) {
        headerCells = headerCells.concat(Array(colCount - headerCells.length).fill(""));
      }
      if (aligns.length < colCount) {
        aligns = aligns.concat(Array(colCount - aligns.length).fill("l"));
      }

      const totalWidth = Math.max(2000, opts.tableWidthTwips || DEFAULT_SETTINGS.tableWidthTwips);
      const colWidth = Math.floor(totalWidth / colCount);

      const cellXs = [];
      for (let i = 1; i <= colCount; i++) cellXs.push(colWidth * i);

      const startRowDefs = () => {
        let s = "\\trowd\\trgaph108\\trleft0";
        for (let i = 0; i < colCount; i++) {
          s += ` ${CELL_BORDERS}\\cellx${cellXs[i]}`;
        }
        return s;
      };

      const rowContent = (cells, makeBold) => {
        const padded = cells.slice(0, colCount);
        while (padded.length < colCount) padded.push("");
        let out = "";
        for (let i = 0; i < colCount; i++) {
          const raw = (padded[i] ?? "").trim();
          const content = this.applyInline(raw, opts);
          const ac = alignCode(aligns[i] ?? "l");
          const pre = makeBold ? "\\b " : "";
          const post = makeBold ? "\\b0" : "";
          // cell paragraph; \intbl keeps content inside the row
          out += `\\pard\\intbl ${ac} ${pre}${content}${post}\\cell`;
        }
        return out;
      };

      const emitRow = (cells, isHeader) => {
        // Order: row defs -> cell contents -> row end -> reset paragraph
        r.push(startRowDefs() + rowContent(cells, !!isHeader) + "\\row\\pard");
      };

      if (headerCells) emitRow(headerCells, true);
      for (let i = bodyStart; i < blockRows.length; i++) {
        if (isSeparator(blockRows[i])) continue;
        emitRow(splitRow(blockRows[i]), false);
      }
    };

    // --- Walk lines and emit ---
    for (let i = 0; i < lines.length; i++) {
      let raw = lines[i].replace(/\t/g, "    ");

      // Table with header separator
      if (isTableRow(raw) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
        const block = [raw, lines[i + 1]];
        i += 2;
        while (i < lines.length && isTableRow(lines[i]) && !/^\s*$/.test(lines[i])) {
          block.push(lines[i]); i++;
        }
        i -= 1;
        emitTable(block, true);
        resetLists();
        continue;
      }

      // Simple table without header line
      if (isTableRow(raw) && !/^\s*$/.test(raw)) {
        const block = [raw];
        let j = i + 1;
        while (j < lines.length && isTableRow(lines[j]) && !/^\s*$/.test(lines[j])) {
          block.push(lines[j]); j++;
        }
        emitTable(block, false);
        i = j - 1;
        resetLists();
        continue;
      }

      // Headings
      const h = /^(#{1,6})\s+(.*)$/.exec(raw);
      if (h) {
        const level = h[1].length;
        const text = h[2].trim();
        const sizePt = (opts.headingSizeMap?.[level] ?? DEFAULT_SETTINGS.headingSizeMap[level]) * 2;
        r.push(this.rtfParagraph(this.applyInline(text, opts), { bold: true, size: sizePt }));
        resetLists();
        continue;
      }

      // Ordered list
      let m = /^(\s*)(\d+)\.\s+(.*)$/.exec(raw);
      if (m) {
        const indent = m[1].length;
        const level = Math.floor(indent / indentSpaces);
        const num = parseInt(m[2], 10);
        const text = m[3];

        while (orderedCounters.length <= level) orderedCounters.push(0);
        if (!isNaN(num)) orderedCounters[level] = num; else orderedCounters[level]++;
        orderedCounters.length = level + 1;

        const prefix = `${orderedCounters[level]}. `;
        r.push(this.rtfListItem(prefix, this.applyInline(text, opts), level, twipsPerLevel));
        continue;
      }

      // Unordered list
      m = /^(\s*)[-*+]\s+(.*)$/.exec(raw);
      if (m) {
        const indent = m[1].length;
        const level = Math.floor(indent / indentSpaces);
        if (orderedCounters.length > level) orderedCounters.length = level;
        const text = m[2];
        r.push(this.rtfListItem("• ", this.applyInline(text, opts), level, twipsPerLevel));
        continue;
      }

      // Horizontal rule
      if (/^\s*([-*])\1\1+/.test(raw)) {
        r.push("\\par\\pard\\qr\\plain\\fs18------------------------------\\par\\pard");
        resetLists();
        continue;
      }

      // Blank line
      if (/^\s*$/.test(raw)) {
        r.push("\\par");
        resetLists();
        continue;
      }

      // Normal paragraph
      r.push(this.rtfParagraph(this.applyInline(raw.trim(), opts)));
      resetLists();
    }

    r.push("}");
    return r.join("\n");
  }

  // Inline formatting
  applyInline(txt, opts) {
    let s = this.escapeRtf(txt);

    if (opts.keepInlineFormatting) {
      // **bold**
      s = s.replace(/\*\*([^*]+)\*\*/g, (m, g1) => `\\b ${this.escapeRtf(g1)}\\b0`);
      // *italic* (single asterisks only)
      s = s.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, (m, pre, g1) => `${pre}\\i ${this.escapeRtf(g1)}\\i0`);
      // __underline__
      s = s.replace(/__([^_]+)__/g, (m, g1) => `\\ul ${this.escapeRtf(g1)}\\ul0`);
      // ~~strike~~
      s = s.replace(/~~([^~]+)~~/g, (m, g1) => `\\strike ${this.escapeRtf(g1)}\\strike0`);
      // `code`
      s = s.replace(/`([^`]+)`/g, (m, g1) => `{\\f1 ${this.escapeRtf(g1)}}`);
    } else {
      s = s.replace(/\*\*([^*]+)\*\*/g, "$1")
           .replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
           .replace(/__([^_]+)__/g, "$1")
           .replace(/~~([^~]+)~~/g, "$1")
           .replace(/`([^`]+)`/g, "$1");
    }

    return s;
  }

  rtfParagraph(content, opts = {}) {
    const parts = ["\\pard"];
    if (opts.bold) parts.push("\\b");
    if (opts.italic) parts.push("\\i");
    if (opts.size) parts.push(`\\fs${opts.size}`);
    parts.push(" ", content, "\\par");
    if (opts.bold) parts.push("\\b0");
    if (opts.italic) parts.push("\\i0");
    return parts.join("");
  }

  rtfListItem(prefix, content, level, twipsPerLevel) {
    const li = Math.max(0, level) * twipsPerLevel;
    return `\\pard\\li${li}\\tx${li + Math.min(720, twipsPerLevel)} ${this.escapeRtf(prefix)}${content}\\par\\pard`;
  }

  escapeRtf(s) {
    let out = s
      .replace(/\\/g, "\\\\")
      .replace(/{/g, "\\{")
      .replace(/}/g, "\\}");

    // Emit \uN? for non-ASCII
    out = out.replace(/[\u0080-\uFFFF]/g, (ch) => {
      const code = ch.codePointAt(0);
      const signed16 = code > 0x7FFF ? code - 0x10000 - 0x8000 + 0x8000 : code;
      return `\\u${signed16}?`;
    });

    return out;
  }

  onunload() {}
};

