import * as vscode from 'vscode';
import { CodeTime } from './codetime';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
let codetime;
export function activate(context) {
    codetime = new CodeTime(context.globalState);
    vscode.commands.registerCommand('crackeddev.getToken', () => {
        codetime.setToken();
    });
    vscode.commands.registerCommand('codetime.codeTimeInStatusBar', () => {
        codetime.codeTimeInStatBar();
    });
    vscode.commands.registerCommand('codetime.toDashboard', () => {
        const url = `https://3000-ymohit1603-crackeddev-hj0httjeb5b.ws-us118.gitpod.io/api/leaderboard`;
        vscode.env.openExternal(vscode.Uri.parse(url));
    });
}
export function deactivate() {
    if (codetime) {
        codetime.dispose();
    }
}
//# sourceMappingURL=extension.js.map