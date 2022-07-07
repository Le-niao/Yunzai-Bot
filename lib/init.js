import fs from "fs";
import log4js from "log4js";
import { createClient } from "redis";
import lodash from "lodash";
import schedule from "node-schedule";
import common from "./common.js";

//设置时区
process.env.TZ = "Asia/Shanghai";

const _path = process.cwd();
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
global.isInit = false;

for (let val of process.argv) {
  if (val == "debug") {
    global.debugView = "debug";
    break;
  }
  if (val == "web-debug") {
    global.debugView = "web-debug";
    break;
  }
}

//登录成功初始化
//链接redis
//加载应用功能
//定时任务
//监听config.js
//登录推送消息
export async function init() {
  if (isInit) return;

  //初始化redis
  await initRedis();

  if (typeof test == "undefined") {
    Bot.logger.mark("----------");
    Bot.logger.mark("初始化Yunzai-Bot");
  }

  //初始化配置
  initGroup();

  //初始化功能
  await loadApp(["app", "example"]);

  await loadPlugin(["plugins"]);

  if (typeof test == "undefined") {
    Bot.logger.mark(`Yunzai-Bot 上线成功 版本v${packageJson.version}`);
    Bot.logger.mark("https://github.com/Le-niao/Yunzai-Bot");
    Bot.logger.mark("----------");
  }

  //重写log
  Bot.logger = await log();
  //定时任务
  task();
  //配置config热加载
  hotLoad();
  //功能热加载
  hotLoadApp(["app", "example"]);

  //首次登录推送消息
  firstLogin();
  //初始化完成
  isInit = true;
}

//初始化redis
async function initRedis() {
  let redisUrl = "";
  if (BotConfig.redis.password) {
    redisUrl = `redis://:${BotConfig.redis.password}@${BotConfig.redis.host}:${BotConfig.redis.port}`;
  } else {
    redisUrl = `redis://${BotConfig.redis.host}:${BotConfig.redis.port}`;
  }
  //初始化reids
  const client = createClient({ url: redisUrl });

  client.on("error", function (err) {
    if (err == "Error: connect ECONNREFUSED 127.0.0.1:6379") {
      Bot.logger.error(`请先开启Redis`);
      if (process.platform == "win32") {
        Bot.logger.error(`window：双击redis-server.exe启动`);
      } else {
        Bot.logger.error(`redis启动命令：redis-server --save 900 1 --save 300 10 --daemonize yes`);
      }
      process.exit();
    } else {
      Bot.logger.error(`redis错误:${err}`);
    }
    process.exit();
  });

  await client.connect();
  client.select(BotConfig.redis.db);
  global.redis = client;
}

//初始化配置
async function initGroup() {
  let groupConfig = {};
  groupConfig.default = BotConfig.group.default;
  for (let i in BotConfig.group) {
    if (i == "default") {
      continue;
    }
    groupConfig[i] = Object.assign({}, BotConfig.group.default, BotConfig.group[i]);
  }
  global.groupConfig = groupConfig;

  //创建文件夹
  if (!fs.existsSync("./data/html/")) {
    fs.mkdirSync("./data/html/");
  }
  if (!fs.existsSync(`./data/html/genshin/`)) {
    fs.mkdirSync(`./data/html/genshin/`);
  }

  //读取体力cookie
  global.NoteCookie = {};
  if (!fs.existsSync("./data/NoteCookie/")) {
    fs.mkdirSync("./data/NoteCookie/");

    //之前存redis的改为保存到本地
    let keys = await redis.keys(`genshin:cookie:*`);
    if (keys && keys.length > 0) {
      for (let key of keys) {
        let cookie = await redis.get(key);
        NoteCookie[key.replace("genshin:cookie:", "")] = JSON.parse(cookie);
        redis.del(key);
      }
      redis.del(`genshin:dailyNote:push`);
      YunzaiApps.dailyNote.saveJson();
    }
  } else if (fs.existsSync("./data/NoteCookie/NoteCookie.json")) {
    global.NoteCookie = JSON.parse(fs.readFileSync("./data/NoteCookie/NoteCookie.json", "utf8"));
  }

  //初始化统计
  redis.set(`Yunzai:sendMsgNum:${BotConfig.account.qq}`, 0);
}

//定时任务
async function task() {
  if (typeof test != "undefined") return;

  //体力推送
  schedule.scheduleJob("0 0/10 * * * ? ", () => YunzaiApps.dailyNote.DailyNoteTask());
  //自动签到
  schedule.scheduleJob(BotConfig.pushTask.signTime, () => YunzaiApps.dailyNote.signTask());
  //官方公告推送
  schedule.scheduleJob("0 3,33 * * * ? ", () => YunzaiApps.newsListBBS.pushNewsTask());
  /** 原石统计推送 */
  // schedule.scheduleJob("0 0 10 L * ? ", () => YunzaiApps.dailyNote.ledgerTask());
}

//加载功能
export async function loadApp(dir) {
  let YunzaiApps = {};
  let command = [];
  for (let val of dir) {
    let readDir = fs.readdirSync(_path + `/lib/${val}`);
    readDir = readDir.filter((item) => /.js$/.test(item));

    for (let v of readDir) {
      try {
        let tmp = await import(`./${val}/${v}`);
        if (!tmp.rule) continue;
        let type = v.replace(".js", "");
        YunzaiApps[type] = tmp;
        for (let i in tmp.rule) {
          tmp.rule[i].type = type;
          tmp.rule[i].name = i;
          command.push(tmp.rule[i]);
        }
      } catch (error) {
        Bot.logger.error(`报错：${v}`);
        console.log(error);
        process.exit();
      }
    }
  }
  command = lodash.orderBy(command, ["priority"], ["asc"]);

  global.YunzaiApps = YunzaiApps;
  global.command = command;
  global.GroupCommand = [];

  saveCommand(command);
}

// 加载Plugin
async function loadPlugin(dir) {
  let YunzaiApps = global.YunzaiApps || {};
  let command = global.command || [];

  for (let val of dir) {
    if (!fs.existsSync(_path + `/${val}/`)) {
      fs.mkdirSync(_path + `/${val}/`);
    }
    let readDir = fs.readdirSync(_path + `/${val}/`);
    for (let v of readDir) {
      if (!fs.existsSync(_path + `/${val}/${v}/index.js`)) {
        continue;
      }
      try {
        let tmp = await import(`../${val}/${v}/index.js`);
        let rules = tmp.rule;
        if (!rules) {
          continue;
        }
        if (typeof rules === "function") {
          rules = rule();
        }
        let type = v.replace(".js", "");
        YunzaiApps["plugin_" + type] = tmp;
        for (let i in rules) {
          rules[i].type = type;
          rules[i].name = i;
          rules[i]._plugin = type;
          command.push(tmp.rule[i]);
        }
      } catch (error) {
        if (global.debugView) {
          throw error;
        } else {
          Bot.logger.error(`报错：${v}`);
          console.log(error);
        }
        process.exit();
      }
    }
  }

  command = lodash.orderBy(command, ["priority"], ["asc"]);

  global.YunzaiApps = YunzaiApps;
  global.command = command;

  saveCommand(command);
}

let fsTimeout = {};

//config热更新
async function hotLoad() {
  fs.watch("./config/config.js", async (event, filename) => {
    if (fsTimeout.config) {
      return;
    }
    fsTimeout.config = true;

    setTimeout(async () => {
      let config;
      try {
        config = (await import(`../config/config.js?version=${new Date().getTime()}`)).config;
      } catch (err) {
        Bot.logger.error(`配置报错：config.js\n${err}`);
        fsTimeout.config = null;
        return;
      }

      for (let k in global.BotConfig) {
        if (lodash.isUndefined(config[k])) {
          delete global.BotConfig[k];
        }
      }

      for (let k in config) {
        global.BotConfig[k] = config[k];
      }

      let groupConfig = {};
      groupConfig.default = config.group.default;
      for (let i in config.group) {
        if (i == "default") {
          continue;
        }
        groupConfig[i] = Object.assign({}, config.group.default, config.group[i]);
      }
      global.groupConfig = groupConfig;

      Bot.logger.mark("更新配置config成功");
      fsTimeout.config = null;
    }, 500);
  });
}

//app热更新
async function hotLoadApp(dir) {
  for (let val of dir) {
    fs.watch(`./lib/${val}`, async (event, filename) => {
      let re = new RegExp(`.js$`, "i");
      if (fsTimeout[val] || !re.test(filename)) {
        return;
      }
      fsTimeout[val] = true;

      let type = filename.replace(".js", "");

      setTimeout(async () => {
        if (!fs.existsSync(`./lib/${val}/${filename}`)) {
          fsTimeout[val] = null;
          return;
        }
        let tmp;
        try {
          tmp = await import(`./${val}/${filename}?version=${new Date().getTime()}`);
        } catch (err) {
          Bot.logger.error(`报错${val}/${type}.js\n${err}`);
          fsTimeout[val] = null;
          return;
        }
        let rule = tmp.rule;
        if (!rule) {
          fsTimeout[val] = null;
          return;
        }
        for (let i in command) {
          if (type == command[i].type && rule[command[i].name]) {
            command[i] = { ...rule[command[i].name], type: type, name: command[i].name };
            delete rule[command[i].name];
          }
        }
        if (Object.keys(rule).length != 0) {
          for (let i in rule) {
            command.push({ ...rule[i], type: type, name: i });
          }
        }

        command = lodash.orderBy(command, ["priority"], ["asc"]);
        YunzaiApps[type] = tmp;

        YunzaiApps.admin.uphotLoad();

        Bot.logger.mark(`更新${val}/${type}.js完成`);
        fsTimeout[val] = null;
      }, 500);
    });
  }
}

export async function reloadPlugin(plugin) {
  if (!fs.existsSync(`./plugins/${plugin}/index.js`)) {
    return;
  }
  let tmp;
  try {
    tmp = await import(`../plugins/${plugin}/index.js?version=${new Date().getTime()}`);
  } catch (err) {
    Bot.logger.error(`报错${plugin}/index.js\n${err}`);
    return;
  }
  let type = plugin;

  let rule = tmp.rule;
  if (!rule) {
    return false;
  }

  for (let i in command) {
    if (plugin == command[i]._plugin && rule[command[i].name]) {
      command[i] = {
        ...rule[command[i].name],
        type: type,
        name: command[i].name,
        _plugin: plugin,
      };
      delete rule[command[i].name];
    }
  }
  if (Object.keys(rule).length != 0) {
    for (let i in rule) {
      command.push({
        ...rule[i],
        type: type,
        name: i,
        _plugin: plugin,
      });
    }
  }

  command = lodash.orderBy(command, ["priority"], ["asc"]);
  YunzaiApps[type] = tmp;

  Bot.logger.mark(`更新${plugin}/index.js完成`);
}

//重新配置logger
async function log() {
  log4js.configure({
    appenders: {
      console: {
        type: "console",
        category: "console",
        layout: {
          type: 'pattern',
          pattern: '[%d{yyyy-MM-ddThh:mm:ss.SSS}] [%[%4.4p%]] %m'
        },
      },
      command: {
        type: "dateFile", //可以是console,dateFile,file,Logstash等
        filename: "logs/command", //将会按照filename和pattern拼接文件名
        pattern: "yyyy-MM-dd.log",
        numBackups: 15,
        alwaysIncludePattern: true,
        layout: {
          type: "pattern",
          pattern: "%d{hh:mm:ss} %m",
        },
      },
      error: {
        type: "file",
        filename: "logs/error.log",
        alwaysIncludePattern: true,
      },
    },
    categories: {
      default: { appenders: ["console"], level: BotConfig.account.log_level },
      command: { appenders: ["console", "command"], level: "warn" },
      error: { appenders: ["console", "error"], level: "error" },
    },
    pm2: true,
  });

  const defaultLogger = log4js.getLogger("message");
  const commandLogger = log4js.getLogger("command");
  const errorLogger = log4js.getLogger("error");

  return {
    trace() {
      defaultLogger.trace.call(defaultLogger, ...arguments);
    },
    debug() {
      defaultLogger.debug.call(defaultLogger, ...arguments);
    },
    info() {
      defaultLogger.info.call(defaultLogger, ...arguments);
    },
    // warn及以上的日志采用error策略
    warn() {
      commandLogger.warn.call(defaultLogger, ...arguments);
    },
    error() {
      errorLogger.error.call(errorLogger, ...arguments);
    },
    fatal() {
      errorLogger.fatal.call(errorLogger, ...arguments);
    },
    mark() {
      errorLogger.mark.call(commandLogger, ...arguments);
    },
  };
}

//首次登录提示
async function firstLogin() {
  if (typeof test != "undefined") {
    return;
  }
  if (!BotConfig.masterQQ || BotConfig.masterQQ.length <= 0) {
    return;
  }

  await YunzaiApps.zupdate.restartTip();

  if (await redis.get(`Yunzai:loginMsg:${BotConfig.account.qq}`)) {
    return;
  }

  let msg = `欢迎使用【Yunzai-Bot v${packageJson.version}】\n【#帮助】查看指令说明\n【#状态】查看运行状态\n【#更新】需要git\n【#重启】重新启动\n【#重新配置】删除配置文件\n【配置cookie】配置公共查询ck\n【检查ck】检查公共ck`;
  let key = `Yunzai:loginMsg:${BotConfig.account.qq}`;

  redis.set(key, "1", { EX: 3600 * 24 });

  setTimeout(() => {
    common.relpyPrivate(BotConfig.masterQQ[0], msg);
  }, 1000);
}

//生成命令json
async function saveCommand(command) {
  let data = {
    dec: "命令总览json，只是查看，修改不起作用，需要到具体文件修改",
  };
  for (let val of command) {
    if (!data[val.type]) {
      data[val.type] = {};
    }

    data[val.type][val.name] = {
      reg: val.reg,
      priority: val.priority,
      describe: val.describe,
    };
  }

  fs.writeFileSync("config/command.json", JSON.stringify(data, "", "\t"));
}

//捕获未处理的Promise错误
process.on("unhandledRejection", (err, promise) => {
  Bot?.logger?.error?.(err);
});

//退出事件
process.on("exit", async (code) => {
  if (typeof redis != "undefined" && typeof test == "undefined") {
    let res = await redis.save();
    // Bot.logger.mark("保存redis数据");
  }
});
