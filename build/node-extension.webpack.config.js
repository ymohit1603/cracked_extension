const path = require("path");

module.exports = {
  target: "node", // Ensure we're bundling for a Node.js environment
  entry: "./src/extension.ts",
  output: {
    path: path.resolve(__dirname, "../dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
  },
  externals: {
    vscode: "commonjs vscode", // ✅ This prevents Webpack from bundling 'vscode'
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
};
