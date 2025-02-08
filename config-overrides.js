const { override, adjustWebpackDevServer } = require('customize-cra');
//import { override, adjustWebpackDevServer } from "customize-cra";

module.exports = override(
  adjustWebpackDevServer((config) => {
    // 修改 devServer 配置
    config.watchOptions = {
      ...config.watchOptions,
      ignored: /public/, // 忽略 public 目录
    };
    return config;
  })
);