import { segment } from "oicq";
import fetch from "node-fetch";
import { createRequire } from "module";
import fs from "fs";
import { render } from "../render.js";
import common from "../common.js";

const require = createRequire(import.meta.url);
const { exec, execSync } = require("child_process");

//项目路径
const _path = process.cwd();

process.env.TZ = "Asia/Shanghai";

let packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
let upKey = "Yunzai:github-pushed";

export const rule = {
  restartApp: {
    reg: "^#重启$", //匹配消息正则，命令正则
    priority: 48, //优先级，越小优先度越高
    describe: "#重启", //【命令】功能说明
  },
  zupdate: {
    reg: "^#(更新|强制更新)$", //匹配消息正则，命令正则
    priority: 49, //优先级，越小优先度越高
    describe: "【#更新】自主git pull，请先确认git pull命令有效", //【命令】功能说明
  },
  checkupdate: {
    reg: "^#*检查更新$", //匹配消息正则，命令正则
    priority: 49, //优先级，越小优先度越高
    describe: "【#检查更新】", //【命令】功能说明
  },
  updateLog: {
    reg: "^#*更新日志[0-9]*$", //匹配消息正则，命令正则
    priority: 49, //优先级，越小优先度越高
    describe: "【#更新日志】默认查询最新的两条更新日志，通过更新日志2、3翻页查询", //【命令】功能说明
  },
};

export async function zupdate(e) {
  if (!e.isMaster) {
    e.reply("您无权操作");
    return true;
  }

  let isForce = e.msg.includes("强制") ? true : false;

  let command = "git pull";

  if (isForce) {
    command = "git checkout . && git pull";
    e.reply("正在执行强制更新操作，请稍等");
  } else {
    e.reply("正在执行更新操作，请稍等");
  }

  var ls = exec(command, function (error, stdout, stderr) {
    if (error) {
      let isChanges = error.toString().includes("Your local changes to the following files would be overwritten by merge") ? true : false;

      let isNetwork = error.toString().includes("fatal: unable to access") ? true : false;

      if (isChanges) {
        //git stash && git pull && git stash pop stash@{0}
        //需要设置email和username，暂不做处理
        e.reply(
          "失败！\nError code: " +
          error.code +
          "\n" +
          error.stack +
          "\n\n本地代码与远程代码存在冲突,上面报错信息中包含冲突文件名称及路径，请尝试处理冲突\n如果不想保存本地修改请使用【#强制更新】\n(注意：强制更新命令会忽略所有本地对Yunzai-Bot本身文件的修改，本地修改均不会保存，请注意备份，lib/example不影响)"
        );
      } else if (isNetwork) {
        e.reply(
          "失败！\nError code: " + error.code + "\n" + error.stack + "\n\n可能是网络问题，请关闭加速器之类的网络工具，或请过一会尝试。"
        );
      } else {
        e.reply("失败！\nError code: " + error.code + "\n" + error.stack + "\n\n出错了。请尝试处理错误");
      }
    } else {
      setUpdatetime(e);
    }
  });

  return true; //返回true 阻挡消息不再往下
}

export async function checkupdate(e) {
  if (!e.isMaster) {
    e.reply("您无权操作");
    return true;
  }
  let url = "https://api.github.com/repos/yoimiya-kokomi/Yunzai-Bot"; //git地址
  let msg =
    "\n使用【#更新】命令进行更新\n出现错误请尝试处理冲突再【#更新】或使用【#强制更新】\n(注意：强制更新命令会忽略所有本地对Yunzai-Bot本身文件的修改，本地修改均不会保存，lib/example不影响)";
  let response = await fetch(url); //调用接口获取数据

  if (!response.ok) {
    Bot.logger.error(`api.github.com/repos/Le-niao/Yunzai-Bot访问失败`);
    e.reply(`检查失败：接口访问失败`);
    return true;
  }

  const res = await response.json(); //结果json字符串转对象
  let newtime = new Date(res.pushed_at);
  let oldtime = await redis.get(upKey);

  if (!oldtime) {
    msg = `github有更新！\n上次更新版本时间：/\n目前最新版本时间：${newtime.toLocaleString()}${msg}`;
  } else {
    oldtime = new Date(oldtime);
    if (newtime.getTime() - oldtime.getTime()) {
      msg = `github有更新！\n上次更新版本时间：${oldtime.toLocaleString()}\n目前最新版本时间：${newtime.toLocaleString()}${msg}`;
    } else {
      msg = `没有检查到更新\n最后更新时间：${newtime.toLocaleString()}`;
    }
  }
  e.reply(msg);
  return true;
}

export async function setUpdatetime(e) {
  // redis.set(upKey, "2022-04-04T03:51:03Z");  test

  let url = "https://api.github.com/repos/yoimiya-kokomi/Yunzai-Bot"; //git地址
  let response = await fetch(url); //调用接口获取数据
  let res = await response.json(); //结果json字符串转对象
  // console.log("setUpdatetime:", res.pushed_at);
  let oldtimetemp = res.pushed_at;

  url = "https://api.github.com/repos/yoimiya-kokomi/Yunzai-Bot/commits";
  response = await fetch(url); //调用接口获取数据
  res = await response.json(); //结果json字符串转对象
  // console.log(res);

  let commitsLog = "";

  let oldtime = new Date(await redis.get(upKey));

  let daylogs = [];

  let name = "自上次更新以来提交日志";

  let version = packageJson.version;

  let more = `上次更新时间：${oldtime.toLocaleString()}`;

  for (const resKey in res) {
    let commitsTime = new Date(res[resKey].commit.committer.date);
    if (commitsTime - oldtime > 0) {
      // commitsLog += res[resKey].commit.author.name+ " : " + res[resKey].commit.message;
      // if(resKey != res.length){
      //     commitsLog += "\n";
      // }
      let logTemp = {};
      logTemp["time"] = commitsTime.toLocaleString();
      logTemp["logs"] = [res[resKey].commit.author.name + " : " + res[resKey].commit.message];
      daylogs.push(logTemp);
    }
  }
  // console.log("daylogs",daylogs);
  let base64 = await render(
    "update",
    "zupdate",
    {
      name,
      version,
      daylogs,
      more,
    },
    "png"
  );

  if (daylogs.length < 1) {
    e.reply("执行更新成功！ \n" + "当前版本已经是最新了！暂不需要更新。");
  } else {
    if (base64) {
      await e.reply(segment.image(`base64://${base64}`));
      await e.reply("代码拉取成功，请自行重启完成更新");
    }
  }

  redis.set(upKey, oldtimetemp);

  // console.log("commitsLog.length:",commitsLog.length,commitsLog);

  // if (commitsLog.length < 1){
  //     e.reply('执行更新成功！ \n' + "当前版本已经是最新了！暂不需要更新。");
  // }
  // else {
  //     e.reply('已更新成功！ 自上次更新以来提交记录： \n' + commitsLog);
  // }
}

export async function updateLog(e) {
  let page = e.msg.replace(/#|＃|更新日志/g, "").trim();

  let pageSize = 3;
  if (!page) {
    page = 1;
  }

  let url = "https://api.github.com/repos/yoimiya-kokomi/Yunzai-Bot/contents/resources/readme/更新日志.md?ref=master"; //git地址
  let response = await fetch(url); //调用接口获取数据
  let res = await response.json(); //结果json字符串转对象

  var str = Buffer.from(res.content, "base64").toString();

  let logs = str.split("###").filter((i) => i && i.trim());

  if (logs.length == 0) {
    e.reply("抱歉，可能由于网络原因，暂时查不到更新日志信息，请稍后再试。");
    return true;
  }

  let allNum = logs.length;
  logs = pagination(page, pageSize, logs);

  if (logs.length <= 0) {
    e.reply(`更新日志没有第${page}页，请输入1~${Math.ceil(allNum / pageSize)}的页码`);
    return true;
  }

  let version = packageJson.version;

  let more = `第 ${page}/${Math.ceil(allNum / pageSize)}  页 （输入【#更新日志1-${Math.ceil(allNum / pageSize)} 】查看更多）`;

  let daylogs = [];

  for (let i = 0; i < logs.length; i++) {
    let logTemp = {};
    logTemp["time"] = logs[i].match(/(\d{4})-(\d{1,2})-(\d{1,2})/g)[0];
    logTemp["logs"] = logs[i].match(/^-(.*)/gm);
    daylogs.push(logTemp);
    // console.log("logs[i]",logs[i]);
  }
  // console.log("logs",daylogs);
  let name = "更新日志";

  let base64 = await render(
    "update",
    "zupdate",
    {
      name,
      version,
      daylogs,
      more,
    },
    "png"
  );

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }

  return true;
}

//数组分页
function pagination(pageNo, pageSize, array) {
  var offset = (pageNo - 1) * pageSize;
  return offset + pageSize >= array.length ? array.slice(offset, array.length) : array.slice(offset, offset + pageSize);
}

//重启
export async function restartApp(e) {

  if (!e.isMaster) {
    e.reply("您无权操作");
    return true;
  }

  await e.reply("开始执行重启，请稍等...");
  Bot.logger.mark("开始执行重启，请稍等...");

  let data = JSON.stringify({
    isGroup: e.isGroup ? true : false,
    id: e.isGroup ? e.group_id : e.user_id,
  });

  try {

    await redis.set("Yunzai:restart", data, { EX: 120 });

    let cm = `npm run start`;
    if (process.argv[1].includes("pm2")) {
      cm = `npm run restart`;
    }

    exec(cm, (error, stdout, stderr) => {
      if (error) {
        redis.del(`Yunzai:restart`);
        e.reply(`操作失败！\n${error.stack}`);
        Bot.logger.error(`重启失败\n${error.stack}`);
      } else if (stdout) {
        Bot.logger.mark("重启成功，运行已转为后台，查看日志请用命令：npm run log");
        Bot.logger.mark("停止后台运行命令：npm stop");
        process.exit();
      }
    });
  } catch (error) {
    redis.del(`Yunzai:restart`);
    e.reply(`操作失败！\n${error.stack}`);
  }

  return true;
}

//重启成功通知
export async function restartTip() {
  let restart = await redis.get(`Yunzai:restart`);
  if (restart) {
    restart = JSON.parse(restart);
    if (restart.isGroup) {
      Bot.pickGroup(restart.id).sendMsg(`重启成功`);
    } else {
      common.relpyPrivate(restart.id, `重启成功`);
    }
    redis.del(`Yunzai:restart`);
  }
}
