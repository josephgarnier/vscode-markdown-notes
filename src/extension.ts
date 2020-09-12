import * as vscode from 'vscode';
import { API } from './API';
import { BacklinksTreeDataProvider } from './BacklinksTreeDataProvider';
import { MarkdownDefinitionProvider } from './MarkdownDefinitionProvider';
import { MarkdownReferenceProvider } from './MarkdownReferenceProvider';
import { MarkdownFileCompletionItemProvider } from './MarkdownFileCompletionItemProvider';
import { NoteWorkspace } from './NoteWorkspace';
import { NoteParser } from './NoteParser';
import { getRefAt, RefType } from './Ref';
// import { debug } from 'util';
// import { create } from 'domain';

let c = vscode.workspace.getConfiguration("vscodeMarkdownNotes");

// Function that returns a filename based on the given wikilink.
// Initially uses filesForWikiLinkRefFromCache() to try and find a matching file.
// If this fails, it will attempt to make a (relative) link based on the label given.
function PageNameGenerator(label: string) {
    console.debug(label);
    const ref = {
        type: RefType.WikiLink,
        word: label,
        hasExtension: false,
        range: undefined
    }
    const results = MarkdownDefinitionProvider.filesForWikiLinkRefFromCache(ref, null);

    label = label.replace(/\.[^\.\\\/]+$/, '');

    // Either use the first result of the cache, or in the case that it's empty use the label to create a path
    let path: string = (results.length != 0) ? results[0].path : NoteWorkspace.noteFileNameFromTitle(label);
    
    return path;
}

function postProcessPageName(pageName: string) {
    pageName = pageName.trim();
    pageName = pageName.replace(/\.[^\.\\\/]+$/, '');

    return pageName;

}
  
function postProcessLabel(label: string) {
	label = label.trim();
	
	// Remove filename extension
	label = label.replace(/\.[^/.]+$/, "");
    
    
    label = label.split(`${c.get('slugifyCharacter')}`).join(" ");
    if (c.get('showFileExtensionInPreview')) {
        label += `.${c.get('defaultFileExtension')}`;
    }

    switch (c.get('previewlabelstyling')) {
        case "[[label]]":
            return `[[${label}]]`;
        case "[label]":
            return `[${label}]`;
        case "label":
            return label;
    }
    ;
}

export function activate(context: vscode.ExtensionContext) {
  // console.debug('vscode-markdown-notes.activate');
  const ds = NoteWorkspace.DOCUMENT_SELECTOR;
  NoteWorkspace.overrideMarkdownWordPattern(); // still nec to get ../ to trigger suggestions in `relativePaths` mode

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(ds, new MarkdownFileCompletionItemProvider())
  );
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(ds, new MarkdownDefinitionProvider())
  );

  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(ds, new MarkdownReferenceProvider())
  );

  vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
    NoteParser.updateCacheFor(e.document.uri.fsPath);

    if (NoteWorkspace.triggerSuggestOnReplacement()) {
      // See discussion on https://github.com/kortina/vscode-markdown-notes/pull/69/
      const shouldSuggest = e.contentChanges.some((change) => {
        const ref = getRefAt(e.document, change.range.end);
        return ref.type != RefType.Null && change.rangeLength > ref.word.length;
      });
      if (shouldSuggest) {
        vscode.commands.executeCommand('editor.action.triggerSuggest');
      }
    }
  });

  let newNoteDisposable = vscode.commands.registerCommand(
    'vscodeMarkdownNotes.newNote',
    NoteWorkspace.newNote
  );
  context.subscriptions.push(newNoteDisposable);
  let d = vscode.commands.registerCommand(
    'vscodeMarkdownNotes.notesForWikiLink',
    API.notesForWikiLink
  );
  context.subscriptions.push(d);

  // parse the tags from every file in the workspace
  NoteParser.hydrateCache();

  const backlinksTreeDataProvider = new BacklinksTreeDataProvider(
    vscode.workspace.rootPath || null
  );
  vscode.window.onDidChangeActiveTextEditor(() => backlinksTreeDataProvider.reload());
  const treeView = vscode.window.createTreeView('vscodeMarkdownNotesBacklinks', {
    treeDataProvider: backlinksTreeDataProvider,
  });

  // See: https://code.visualstudio.com/api/extension-guides/markdown-extension
  // For more information on how this works.
  return {
    extendMarkdownIt(md: any) {
        return md.use(
            
            require('@thomaskoppelaar/markdown-it-wikilinks')({ 
                generatePageNameFromLabel: PageNameGenerator, 
                postProcessPageName: postProcessPageName, 
                postProcessLabel: postProcessLabel,
                uriSuffix: `.${c.get('defaultFileExtension')}`,
                description_then_file: c.get("pipedWikiLinksSyntax") == "desc|file",
                separator: c.get("pipedWikiLinksSeparator")
            }));
    }
    };
}
