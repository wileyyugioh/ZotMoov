Components.utils.importGlobalProperties(['PathUtils', 'IOUtils']);

var ZotMoov = class {
    /**
     *
     * @param id {string}
     * @param version {string}
     * @param sanitizer {FileNameSanitizer}
     * @param zotmoov_debugger {ZotMoovDebugger}
     */
    constructor(id, version, sanitizer, zotmoov_debugger) {
        this.id = id;
        this.version = version;
        this.sanitizer = sanitizer;
        this.zotmoov_debugger = zotmoov_debugger;

        const config = Zotero.Prefs.get('extensions.zotmoov.subdirectory_string', true);
        const getItemTemplatePossibilities = new GetItemTemplatePossibilities();
        this.configuration_parser = new ConfigurationParser(config, zotmoov_debugger, getItemTemplatePossibilities);
        this.item_factory = new ItemFactory(new CreatorModelFactory(), zotmoov_debugger, sanitizer, 3, ', ');
    }

    async _getCopyPath(zoteroItem, dst_path, arg_options = {})
    {
        const default_options = {
            into_subfolder: false,
            subdir_str: '',
            preferred_collection: null,
            undefined_str: 'undefined',
            custom_wc: {},
            rename_file: true,
        };
        let options = {...default_options, ...arg_options};

        let file_path = zoteroItem.getFilePath();
        if (!file_path) return '';

        let file_name = file_path.split(/[\\/]/).pop();
        this.zotmoov_debugger.debug("Getting copy path for: " + file_name);

        if (options.rename_file && zoteroItem.parentItem)
        {
            let file_ext = file_path.split('.').pop().toLowerCase();
            let renamed = await Zotero.Attachments.getRenamedFileBaseNameIfAllowedType(zoteroItem.parentItem, file_path);
            if (renamed) file_name = renamed + '.' + file_ext;
        }

        let local_dst_path = dst_path;

        // Optionally add subdirectory folder here
        if (options.into_subfolder)
        {
            const item = this.item_factory.createItem(zoteroItem);
            let custom_dir = this.configuration_parser.parse(item);
            let sanitized_custom_dir = custom_dir.split('/').map((dir) => this.sanitizer.sanitize(dir, '_'));
            local_dst_path = PathUtils.join(local_dst_path, ...sanitized_custom_dir);
        }

        let copy_path = PathUtils.join(local_dst_path, file_name);
        this.zotmoov_debugger.debug("Final path: " + copy_path)

        return copy_path;
    }

   async delete(items, home_path, arg_options = {})
    {
        const default_options = {
            prune_empty_dir: true
        };

        let options = {...default_options, ...arg_options};

        if (home_path == '') return;
        let home_path_arr = PathUtils.split(home_path);

        let promises = [];
        for (let item of items)
        {
            if (!item.isFileAttachment()) continue;
            if (item.libraryID != Zotero.Libraries.userLibraryID) continue;

            // Check to see if file is a linked file
            if (item.attachmentLinkMode != Zotero.Attachments.LINK_MODE_LINKED_FILE) continue;

            let fp = item.getFilePath();
            if (!fp) continue;
            let fp_arr = PathUtils.split(fp);

            // Check to see if file is in home_path
            let ok = true;
            for (let [i, dir] of home_path_arr.entries())
            {
                if (dir == fp_arr[i]) continue;

                ok = false;
                break;
            }
            if (!ok) continue;

            promises.push((async () => {
                // It is, so delete the file
                let p = await IOUtils.remove(fp);

                // Delete empty directories recursively up to home directory
                if (options.prune_empty_dir)
                {
                    let path_arr = fp_arr.slice();
                    path_arr.pop();

                    while(path_arr.length > home_path_arr.length)
                    {
                        let path = PathUtils.join(...path_arr);
                        let children = await IOUtils.getChildren(path);

                        // Filter out .DS_Store and Thumbs.db
                        let filter_children = children.filter((c) => {
                            let filename = PathUtils.filename(c);
                            return !(['.DS_Store', 'Thumbs.db', 'desktop.ini'].includes(filename));
                        });

                        if (filter_children.length > 0) return;

                        // Delete the pesky files we don't care about
                        for (let child of children)
                        {
                            await IOUtils.remove(child);
                        }

                        // Remove the directory if it is empty
                        await IOUtils.remove(path);
                        path_arr.pop();
                    }
                }
            })());
        }

        await Promise.allSettled(promises);
    }

    async move(items, dst_path, arg_options = {})
    {
        // TODO - Mr. Hoorn - Refactor this entire file for maintainability.
        // Perhaps also rewrite the script builder to manually account for dependencies?
        const default_options = {
            ignore_linked: false,
            into_subfolder: false,
            subdir_str: '',
            allowed_file_ext: null,
            preferred_collection: null,
            rename_title: true,
            undefined_str: 'undefined',
            custom_wc: {},
            add_zotmoov_tag: true,
            tag_str: 'zotmoov',
            rename_file: true
        };

        let options = {...default_options, ...arg_options};

        // Convert to lowercase to ensure case insensitive
        if (Array.isArray(options.allowed_file_ext))
        {
            options.allowed_file_ext = options.allowed_file_ext.map(ext => ext.toLowerCase());
        }

        if (dst_path == '') return;

        let promises = [];
        for (let item of items)
        {
            if (!item.isFileAttachment()) continue;
            if (item.libraryID != Zotero.Libraries.userLibraryID) continue;

            if (options.ignore_linked)
            {
                if (item.attachmentLinkMode != Zotero.Attachments.LINK_MODE_IMPORTED_FILE &&
                    item.attachmentLinkMode != Zotero.Attachments.LINK_MODE_IMPORTED_URL) continue;
            }

            let file_path = item.getFilePath();
            if (!file_path) continue;

            // Test to see if file extension is allowed
            if (Array.isArray(options.allowed_file_ext))
            {
                let file_ext = file_path.split('.').pop().toLowerCase();
                if (!options.allowed_file_ext.includes(file_ext)) continue;
            }

            let copy_path = await this._getCopyPath(item, dst_path,
                {
                    into_subfolder: options.into_subfolder,
                    subdir_str: options.subdir_str,
                    preferred_collection: options.preferred_collection,
                    undefined_str: options.undefined_str,
                    custom_wc: options.custom_wc,
                    rename_file: options.rename_file
            });
            
            if (!copy_path) continue;

            // Have to check since later adding an entry triggers the
            // handler again
            if (file_path == copy_path) continue;

            let final_path = copy_path;
            let path_arr = final_path.split('.');
            let file_ext = path_arr.pop();
            let rest_of_path = path_arr.join('.');

            let i = 1;
            while(await IOUtils.exists(final_path)) final_path = rest_of_path + ' ' + (i++) + '.' + file_ext;

            let clone = item.clone(null, { includeCollections: true });
            clone.attachmentLinkMode = Zotero.Attachments.LINK_MODE_LINKED_FILE;
            clone.attachmentPath = final_path;
            if (options.rename_title) clone.setField('title', PathUtils.filename(final_path));
            clone.dateAdded = item.dateAdded;

            // Temporary fix for file path issue
            if (final_path.length > 260) {
                this.zotmoov_debugger.error("File path too long: " + final_path + "\nTotal " + (final_path.length) + " characters");
                this.zotmoov_debugger.debug("Implementing temporary fix; renaming file to paper.pdf");

                const original_file_name = PathUtils.filename(file_path);
                const new_file_name = 'paper.pdf';

                final_path = final_path.replace(original_file_name, new_file_name);

                if (final_path.length > 260) {
                    this.zotmoov_debugger.error("File path too long after temporary fix: " + final_path + "\nTotal " + (final_path.length) + " characters\nSKIPPING!");
                    return;
                }

                this.zotmoov_debugger.debug("Final path: " + final_path);
            }

            if (options.add_zotmoov_tag) clone.addTag(options.tag_str);

            promises.push((async () => {
                await IOUtils.copy(file_path, final_path, { noOverwrite: true });

                await Zotero.DB.executeTransaction(async () => {
                    let id = await clone.save();
                    await Zotero.Items.moveChildItems(item, clone);
                    await Zotero.Relations.copyObjectSubjectRelations(item, clone);
                    await Zotero.Fulltext.transferItemIndex(item, clone).catch((e) => { Zotero.logError(e); });

                    // Update timestamps
                    const file_info = await IOUtils.stat(file_path);
                    IOUtils.setModificationTime(final_path, file_info.lastModified);

                    await item.erase();
                    await IOUtils.remove(file_path); // Include this in case moving another linked file
                }).catch((e) => {
                    IOUtils.remove(final_path);

                    throw e;
                });
                return clone;
            })());
        }

        const temp = await Promise.allSettled(promises);

        return temp.filter(result => result.status === 'fulfilled' && result.value)
                    .map(result => result.value);
    }

    async copy(items, dst_path, arg_options = {})
    {
        const default_options = {
            into_subfolder: false,
            subdir_str: '',
            allow_group_libraries: false,
            allowed_file_ext: null,
            preferred_collection: null,
            undefined_str: 'undefined',
            custom_wc: {},
            rename_file: true
        };

        let options = {...default_options, ...arg_options};

        // Convert to lowercase to ensure case insensitive
        if (Array.isArray(options.allowed_file_ext))
        {
            options.allowed_file_ext = options.allowed_file_ext.map(ext => ext.toLowerCase());
        }

        if (dst_path == '') return;

        let promises = [];
        for (let item of items)
        {
            if (!item.isFileAttachment()) continue;
            if (!options.allow_group_libraries && item.libraryID != Zotero.Libraries.userLibraryID) continue;

            let file_path = item.getFilePath();
            if (!file_path) continue;

            // Test to see if file extension is allowed
            if (Array.isArray(options.allowed_file_ext))
            {
                let file_ext = file_path.split('.').pop().toLowerCase();
                if (!options.allowed_file_ext.includes(file_ext)) continue;
            }

            let copy_path = await this._getCopyPath(item, dst_path, {
                    into_subfolder: options.into_subfolder,
                    subdir_str: options.subdir_str,
                    preferred_collection: options.preferred_collection,
                    undefined_str: options.undefined_str,
                    custom_wc: options.custom_wc,
                    rename_file: options.rename_file
            });
            
            if (!copy_path) continue;
            if (file_path == copy_path) continue;

            let final_path = copy_path;
            let path_arr = final_path.split('.');
            let file_ext = path_arr.pop();
            let rest_of_path = path_arr.join('.');

            let i = 1;
            while (await IOUtils.exists(final_path)) final_path = rest_of_path + ' ' + (i++) + '.' + file_ext;

            promises.push((async () => {
                await IOUtils.copy(file_path, final_path, { noOverwrite: true });
                return item;
            })());
        }

        const temp = await Promise.allSettled(promises);

        return temp.filter(result => result.status === 'fulfilled' && result.value)
                    .map(result => result.value);
    }

    _getSelectedItems()
    {
        let items = Zotero.getActiveZoteroPane().getSelectedItems();
        let att_ids = [];
        let atts = new Set();
        for (let item of items)
        {
            if (item.isAttachment())
            {
                atts.add(item);
                continue;
            }

            att_ids.push(...item.getAttachments());
        }

        let new_atts = Zotero.Items.get(att_ids);
        new_atts.forEach(att => atts.add(att));

        return atts
    }

    async moveSelectedItems()
    {
        let atts = this._getSelectedItems();
        if (!atts.size) return;

        let dst_path = Zotero.Prefs.get('extensions.zotmoov.dst_dir', true);

        let pref = this.getBasePrefs();
        if (Zotero.Prefs.get('extensions.zotmoov.file_behavior', true) == 'move')
        {
            await this.move(atts, dst_path, pref);
        } else
        {
            await this.copy(atts, dst_path, pref);
        }
    }

    async moveFrom(items, arg_options = {})
    {
        const default_options = {
            add_zotmoov_tag: true,
            tag_str: 'zotmoov'
        };

        let options = {...default_options, ...arg_options};

        let atts = Array.from(items).filter((a) => { return a.isLinkedFileAttachment(); });

        let promises = atts.map((item) => (async () => {
            let stored = await Zotero.Attachments.convertLinkedFileToStoredFile(item, { move: true });
            if (!options.add_zotmoov_tag) return stored;

            if (stored.removeTag(options.tag_str)) await stored.saveTx();
            return stored;
        })());

        const temp = await Promise.allSettled(promises);

        return temp.filter(result => result.status === 'fulfilled' && result.value)
                    .map(result => result.value);
    }

    async moveFromDirectory()
    {
        let atts = this._getSelectedItems();
        if (!atts.size) return;

        let pref = this.getBasePrefs();
        this.moveFrom(atts, pref);
    }

    async moveSelectedItemsCustomDir()
    {
        let atts = this._getSelectedItems();
        if (!atts.size) return;

        const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
        let fp = new FilePicker();

        let wm = Services.wm;
        let win = wm.getMostRecentWindow('navigator:browser');

        fp.init(win, Zotero.getString('dataDir.selectDir'), fp.modeGetFolder);
        fp.appendFilters(fp.filterAll);
        
        let rv = await fp.show();
        if (rv != fp.returnOK) return '';

        let pref = this.getBasePrefs();
        pref.into_subfolder = false;
        if(Zotero.Prefs.get('extensions.zotmoov.file_behavior', true) == 'move')
        {
            await this.move(atts, fp.file, pref);
        } else
        {
            await this.copy(atts, fp.file, pref);
        }
    }

    getBasePrefs()
    {
        let allowed_file_ext = JSON.parse(Zotero.Prefs.get('extensions.zotmoov.allowed_fileext', true));
        // Pass null if empty
        allowed_file_ext = (allowed_file_ext.length) ? allowed_file_ext : null;

        return {
            ignore_linked: false,
            into_subfolder: Zotero.Prefs.get('extensions.zotmoov.enable_subdir_move', true),
            subdir_str: Zotero.Prefs.get('extensions.zotmoov.subdirectory_string', true),
            rename_title: Zotero.Prefs.get('extensions.zotmoov.rename_title', true),
            allowed_file_ext: allowed_file_ext,
            preferred_collection: (Zotero.getActiveZoteroPane().getSelectedCollection() ? Zotero.getActiveZoteroPane().getSelectedCollection().id : null),
            undefined_str: Zotero.Prefs.get('extensions.zotmoov.undefined_str', true),
            allow_group_libraries: Zotero.Prefs.get('extensions.zotmoov.copy_group_libraries', true),
            custom_wc: JSON.parse(Zotero.Prefs.get('extensions.zotmoov.cwc_commands', true)),
            add_zotmoov_tag: Zotero.Prefs.get('extensions.zotmoov.add_zotmoov_tag', true),
            tag_str: Zotero.Prefs.get('extensions.zotmoov.tag_str', true),
            rename_file: Zotero.Attachments.shouldAutoRenameFile()
        };
    }
}


