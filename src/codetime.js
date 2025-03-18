import * as os from 'node:os';
import * as process from "process";
import { got } from 'got';
import * as vscode from 'vscode';
import { v4 } from 'uuid';
import osName from 'os-name';
import * as events from './events';
import { getDurationText } from './getDurationText';
import { getGitCurrentBranch, getGitOriginUrl } from './utils';

export class CodeTime {
    osName = osName();
    out = vscode.window.createOutputChannel('Codetime');
    debounceTimer;

    debounce(func, wait) {
        return (...args) => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => func.apply(this, args), wait);
        };
    }

    setToken() {
        console.log("setting token");
        vscode.window
            .showInputBox({
                password: true,
                placeHolder: 'CodeTime: Input Your Token (from: codetime.dev)',
            })
            .then((token) => {
                console.log("token", token);
                if (token && token.trim()) {
                    token = token.trim();
                    console.log('Token received:', token);
                    this.state.update('token', token);
                    this.token = token;
                    this.getCurrentDuration(true);
                } else {
                    vscode.window.showErrorMessage('CodeTime: Invalid or empty token. Please enter a valid token from codetime.dev.');
                    this.statusBar.text = '$(clock) CodeTime: No Token Set';
                    this.statusBar.tooltip = 'Click to Enter Token';
                    this.statusBar.command = 'codetime.getToken';
                    this.token = '';
                }
            });
    }

    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    disposable;
    state;
    client;
    userId;
    token = '';
    inter;
    session;

    constructor(state) {
        this.state = state;
        this.userId = this.getUserId();
        this.initSetToken();
        this.client = got.extend({
            prefixUrl: vscode.workspace.getConfiguration('codetime').serverEntrypoint,
            responseType: 'json',
            headers: {
                'User-Agent': 'CodeTime Client',
            },
            hooks: {
                beforeRequest: [
                    (options) => {
                        if (options.headers) {
                            options.headers.token = this.token;
                        }
                    },
                ],
            },
        });
        this.session = v4();
        this.init();
    }

    getUserId() {
        return 2;
    }

    initSetToken() {
        const stateToken = this.state.get('token');
        const envToken = process.env.CODETIME_TOKEN;
        this.token = envToken || (stateToken || '');
        if (this.token === '') {
            this.setToken();
        }
    }

    init() {
        this.statusBar.text = '$(clock) CodeTime: Initializing...';
        this.statusBar.show();
        this.setupEventListeners();
        this.getCurrentDuration();
        this.inter = setInterval(() => {
            this.getCurrentDuration();
        }, 60 * 1000);
    }

    setupEventListeners() {
        const events = [];
        vscode.workspace.onDidChangeTextDocument(this.onEdit, this, events);
        vscode.window.onDidChangeActiveTextEditor(this.onEditor, this, events);
        vscode.window.onDidChangeTextEditorSelection(this.onChangeTextEditorSelection, this, events);
        vscode.window.onDidChangeTextEditorVisibleRanges(this.onChangeTextEditorVisibleRanges, this, events);
        vscode.window.onDidChangeWindowState(this.onFocus, this, events);
        vscode.workspace.onDidSaveTextDocument(this.onSave, this, events);
        vscode.workspace.onDidCreateFiles(this.onCreate, this, events);
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('codetime')) {
                this.getCurrentDuration();
            }
        });
        this.disposable = vscode.Disposable.from(...events);
    }

    onEdit(e) {
        let eventName = events.FILE_EDITED;
        if (e.document.uri.scheme === 'output') {
            return;
        }
        if (e.contentChanges.length === 1 && /\r\n|\n|\r/.test(e.contentChanges[0].text)) {
            eventName = events.FILE_ADDED_LINE;
            this.onChange(eventName);
        } else if (Math.random() > 0.9) {
            this.onChange(eventName);
        }
    }

    onEditor(_e) {
        this.onChange(events.ACTIVATE_FILE_CHANGED);
    }

    onChangeTextEditorSelection(e) {
        if (e.textEditor.document.uri.scheme === 'output') {
            return;
        }
        if (Math.random() > 0.9) {
            this.onChange(events.CHANGE_EDITOR_SELECTION);
        }
    }

    onChangeTextEditorVisibleRanges = this.debounce((_e) => {
        if (_e.textEditor.document.uri.scheme === 'output') {
            return;
        }
        this.onChange(events.CHANGE_EDITOR_VISIBLE_RANGES);
    }, 300);

    onFocus(_e) {
        this.onChange(events.EDITOR_CHANGED);
    }

    onCreate() {
        this.onChange(events.FILE_CREATED);
    }

    onSave(_e) {
        this.onChange(events.FILE_SAVED);
    }

    platfromVersion = os.release();
    platfromArch = os.arch();

    getOperationType(eventName = 'unknown') {
        switch (eventName) {
            case events.FILE_CREATED:
            case events.FILE_EDITED:
            case events.FILE_ADDED_LINE:
            case events.FILE_REMOVED:
            case events.FILE_SAVED:
                return 'write';
            default:
                return 'read';
        }
    }

    onChange(eventName = 'unknown') {
        const editor = vscode.window.activeTextEditor;
        const workspaceName = vscode.workspace.name;
        const workspaceRoot = vscode.workspace.workspaceFolders;
        if (workspaceRoot && editor) {
            const doc = editor.document;
            if (doc) {
                const lang = doc.languageId;
                const absoluteFilePath = doc.fileName;
                let relativeFilePath = vscode.workspace.asRelativePath(absoluteFilePath);
                if (relativeFilePath === absoluteFilePath) {
                    relativeFilePath = '[other workspace]';
                }
                if (relativeFilePath) {
                    const time = Date.now();
                    const origin = getGitOriginUrl();
                    const branch = getGitCurrentBranch();
                    const data = {
                        project: workspaceName,
                        language: lang,
                        relativeFile: relativeFilePath,
                        absoluteFile: absoluteFilePath,
                        editor: 'VSCode',
                        platform: this.osName,
                        eventTime: time,
                        eventType: eventName,
                        platformArch: this.platfromArch,
                        plugin: 'VSCode',
                        gitOrigin: origin,
                        gitBranch: branch,
                        operationType: this.getOperationType(eventName),
                    };

                    console.log(`Sending data to: ${this.client.defaults.options.prefixUrl}eventLog`);
                    console.log('Payload:', JSON.stringify(data, null, 2));

                    this.client.post(`eventLog`, { json: data }).catch((e) => {
                        console.error('Error sending data:', e);
                    });
                }
            }
        }
    }

    getCurrentDuration(showSuccess = false) {
        const key = vscode.workspace.getConfiguration('codetime').statusBarInfo;
        if (this.token === '') {
            this.statusBar.text = '$(clock) CodeTime: Without Token';
            this.statusBar.tooltip = 'Enter Token';
            this.statusBar.command = 'codetime.getToken';
            return;
        }
        this.statusBar.command = 'codetime.toDashboard';
        this.statusBar.tooltip = 'CodeTime: Head to the dashboard for statistics';
        let minutes = 60 * 24;
        this.client.get(`user/minutes?minutes=${minutes}`).then((res) => {
            const { minutes } = res.body;
            this.statusBar.text = `$(watch) ${getDurationText(minutes * 60 * 1000)}`;
            if (showSuccess) {
                vscode.window.showInformationMessage('CodeTime: Token validation succeeded');
            }
        });
    }

    dispose() {
        this.statusBar.dispose();
        this.disposable.dispose();
        clearInterval(this.inter);
    }
}
