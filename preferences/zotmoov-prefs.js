var React = require('react');
var ReactDOM = require('react-dom');
var VirtualizedTable = require('components/virtualized-table');

class ZotMoovPrefs {
    // Needed to fix Zotero bug where on initial load all of the elements are not
    // loaded because of faulty race-condition when calculating div height
    static FixedVirtualizedTable = class extends VirtualizedTable {
        _getWindowedListOptions() {
            let v = super._getWindowedListOptions();
            v.overscanCount = 10;

            return v;
        }
    }

    constructor(zotmoovMenus)
    {
        this.zotmoovMenus = zotmoovMenus;
    }

    createFileExtTree()
    {
        this._fileexts = JSON.parse(Zotero.Prefs.get('extensions.zotmoov.allowed_fileext', true));

        const columns = [
            {
                dataKey: 'fileext',
                label: 'fileext'
            }
        ];
        
        let renderItem = (index, selection, oldDiv=null, columns) => {
            const ext = this._fileexts[index];
            let div;

            if (oldDiv)
            {
                div = oldDiv;
                div.innerHTML = '';
            } else {
                div = document.createElement('div');
                div.className = 'row';
            }

            div.classList.toggle('selected', selection.isSelected(index));
            div.classList.toggle('focused', selection.focused == index);

            for (let column of columns)
            {
                div.appendChild(VirtualizedTable.renderCell(index, ext, column));
            }

            return div;
        };

        ReactDOM.createRoot(document.getElementById('zotmoov-settings-fileext-tree-2')).render(React.createElement(this.constructor.FixedVirtualizedTable, {
            getRowCount: () => this._fileexts.length,
            id: 'zotmoov-settings-fileext-tree-2-treechildren',
            ref: (ref) => { this._fileext_tree = ref; },
            renderItem: renderItem,
            onSelectionChange: (selection) => this.onFileExtTreeSelect(selection),
            showHeader: false,
            columns: columns,
            staticColumns: true,
            multiSelect: true,
            disableFontSizeScaling: true
        }));
    }

    init()
    {
        let enable_subdir_move = Zotero.Prefs.get('extensions.zotmoov.enable_subdir_move', true);
        document.getElementById('zotmoov-subdir-str').disabled = !enable_subdir_move;

        this.createFileExtTree();
    }

    async pickDirectory()
    {
        const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
        let fp = new FilePicker();

        fp.init(window, Zotero.getString('dataDir.selectDir'), fp.modeGetFolder);
        fp.appendFilters(fp.filterAll);
        
        let rv = await fp.show();
        if (rv != fp.returnOK) return '';

        Zotero.Prefs.set('extensions.zotmoov.dst_dir', fp.file, true);
        document.getElementById('zotmoov-dst-dir').value = fp.file;
    }


    onSubDirClick(cb)
    {
        document.getElementById('zotmoov-subdir-str').disabled = !cb.checked;
    }

    updateMenuItems(item)
    {
        let v = item.value;
        if(v == 'move')
        {
            this.zotmoovMenus.setMove();
        } else
        {
            this.zotmoovMenus.setCopy();
        }
    }

    createFileExtEntry(ext)
    {
        let len = this._fileexts.push(ext);
        this._fileext_tree.invalidate();

        let selection = this._fileext_tree.selection;
        for (let i of selection.selected)
        {
            selection.toggleSelect(i);
        }

        this._fileext_tree.invalidate();
        selection.toggleSelect(len - 1);

        Zotero.Prefs.set('extensions.zotmoov.allowed_fileext', JSON.stringify(this._fileexts), true);

    }

    spawnFileExtDialog()
    {
        window.openDialog('chrome://zotmoov/content/file-ext-dialog.xhtml', 'zotmoov-file-ext-dialog-window', 'chrome,centerscreen,resizable=no,modal');
    }

    removeFileExtEntries()
    {
        let selection = this._fileext_tree.selection;
        for (let index of Array.from(selection.selected).reverse())
        {
            this._fileexts.splice(index, 1);
        }

        this._fileext_tree.invalidate();

        const del_button = document.getElementById('zotmoov-fileext-table-delete');
        if (selection.focused > this._fileexts.length - 1)
        {
            del_button.disabled = true;
        }

        Zotero.Prefs.set('extensions.zotmoov.allowed_fileext', JSON.stringify(this._fileexts), true);
    }

    onFileExtTreeSelect(selection)
    {
        let remove_button = document.getElementById('zotmoov-fileext-table-delete');
        if (selection.count > 0)
        {
            remove_button.disabled = false;
            return;
        }

        remove_button.disabled = true;
    }
}

// Expose to Zotero
Zotero.ZotMoov.Prefs = new ZotMoovPrefs(Zotero.ZotMoov.Menus);
