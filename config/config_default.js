	/**
 * 默认配置
 * 请复制一份重命名为config.js
 * 然后填写配置信息，支持热更新
 */
let config = {
  //qq账号 密码
  account: {
    qq:  "",  //账号
    pwd: "",  //密码，可为空则用扫码登录
    log_level:"info",//日志等级:trace,debug,info,warn,error,fatal,mark,off
    platform:5,      //1:安卓手机、 2:aPad 、 3:安卓手表、 4:MacOS 、 5:iPad
    autoFriend:1,    //1-自动同意加好友 0-好友请求不处理
    autoQuit:1,      //1-自动退小群 0-不处理
  },

  //redis配置(默认配置就好，一般都不用改，使用docker搭建的用户需要更改host项)
  redis: {
    //host: "redis",   //docker redis容器地址，如果使用docker请取消注释此行并注释下一行
    host: "127.0.0.1", //redis地址
    port: 6379,        //redis端口
    password: "",      //redis密码，没有密码可以为空
    db: 0,             //redis数据库
  },

  /**
   * 米游社cookies，支持多个，用逗号隔开
   * 访问米游社原神社区(https://bbs.mihoyo.com/ys/)，登录后账户点击 F12 ，
   * 选中 Console 或控制台，点击控制台粘贴这一句
   * document.cookie ，回车即可获取
   * 获取教程：https://docs.qq.com/doc/DUWNVQVFTU3liTVlO
   * 例如 用引号包住，多个用逗号隔开
   * 'ltoken=***;ltuid=***;',
   * 'ltoken=***;ltuid=***;',
   * cookie逻辑：一个号一天只能查30个uid（包括查询失败的），在没超过30的时候，之前查过的uid可以重复查询
   * 所以项目限制一个cookie只能查27个，避免超出限制，查询过的可以重复查
   * 获取完别退出登录否则cookie就会失效，多账号用无痕（隐身）模式获取
   */
  mysCookies: [
    // 'ltoken=***;ltuid=***;',
    // 'ltoken=***;ltuid=***;',
  ],
  allowUseNoteCookie: false, // 是否允许Bot使用NoteCookie中的记录进行查询
  roleAllAvatar: false, // #角色 命令下是否展示全部角色 true：展示全部角色，false：展示12个角色，默认false
  DisablePrivate:false, //禁用私聊功能 true：私聊只接受ck以及抽卡链接（Bot主人不受限制），false：私聊可以触发全部指令，默认false
  //默认cookie帮助文档链接地址，其他ck帮助链接
  //www.wolai.com/tremorstar/jRjczxsfdsmzWDaDVVwVEM
  //yakultoo.feishu.cn/docs/doccnnepmeWeweGSbjgBM8vIsCe
  cookieDoc:"docs.qq.com/doc/DUWNVQVFTU3liTVlO",

  //推送任务
  pushTask:{
    signTime: "0 2 0 * * ?", //签到任务执行时间，Cron表达式，默认00:02开始执行，每10s签到一个
    isPushSign: 1,           //是否推送签到成功消息 1-推送 0-关闭
    isPushLedger: 1,         //是否推送每月原石统计 1-推送 0-关闭
	isPushNote:1,            //是否推送体力 1-推送 0-关闭
  },

  //群设置
  group: {
    //通用默认配置(不能删除)
    'default': {
      delMsg: 0,        //隔多少毫秒后撤回消息（十连），0不撤回
      gachaDayNum: 1,   //每天抽卡次数，限制次数，防止刷屏,4点重置
      LimitSeparate:0,  //角色池，武器池限制分开计算 0-不分开 1-分开

      //米游社信息查询
      mysDayLimit: 30,  //每天每人查询次数
      mysUidLimit: 5,   //每天每人查询uid个数

      groupCD:  500,    //群聊中所有指令操作冷却时间，单位毫秒,0则无限制
      singleCD: 2000,   //群聊中个人操作冷却时间，单位毫秒
      PokeCD:   10000,  //群聊中戳一戳冷却时间，单位毫秒

      imgAddLimit:0,     //添加表情是否限制  0-所有群员都可以添加 1-群管理员才能添加 2-主人才能添加
      imgMaxSize:2,      //添加表情图片大小限制，默认1m

      imgRate:5,         //随机表情回复概率0-100 需要配置百度ocr 配置往下滚

      onlyReplyAt: false, // 只关注主动at bot的信息
      botAlias: "云崽",  // 在此群bot的名字，如果以此前缀开头，则也认为是at

      //禁用功能 
      //'all','poke','gacha','mysInfo','gachaLog','dailyNote','face','other','ai','reliquaries','strategy_xf'
      // 全部，戳一戳，十连，原神查询，抽卡记录，体力，添加表情，其他，腾讯智障ai，圣遗物评分，西风角色攻略
      disable: [],
    },

    //每个群的单独配置(用于覆盖通用配置)
    //配置项和默认default一样，自行选择
    '213938015':{
      delMsg: 0,        //隔多少毫秒后撤回消息（十连），0不撤回
      gachaDayNum: 1,   //每天抽卡次数，限制次数，防止刷屏,4点重置
      LimitSeparate:0,  //角色池，武器池限制分开计算 0-不分开 1-分开

      //米游社信息查询
      mysDayLimit: 30,  //每天每人查询次数
      mysUidLimit: 5,   //每天每人查询uid个数

      groupCD:  500,    //群聊中所有指令操作冷却时间，单位毫秒,0则无限制
      singleCD: 2000,   //群聊中个人操作冷却时间，单位毫秒
      PokeCD:   10000,  //群聊中戳一戳冷却时间，单位毫秒
      disable: ['all'],//禁用所有功能
    },
    'qq群号':{
      disable: ['all'],//禁用所有功能
    }
  },

  //主人qq，米游社查询，十连不受限制
  masterQQ:[123456,],

  //黑名单qq
  balckQQ:[
    2854196310,
  ],
  //黑名单q群
  balckGroup:[
    213938015,123456,
  ],

  //对话ai,配置后@机器人进行聊天对话，推荐配置将你的机器人变成人工智障
  //腾讯智能对话平台 https://cloud.tencent.com/product/tbp 
  //目前免费使用的，自行认证申请
  tencentAI:{
    secretId:  "",//云产品-管理与审计-访问秘钥获取
    secretKey: "",//云产品-管理与审计-访问秘钥获取
    BotId:     "",//腾讯智能对话平台-Bot信息-BotId
    BotEnv:    "dev",//不用管就填dev
    BotName:   "云崽",//机器人名称
  },

  //百度ocr https://ai.baidu.com/ai-doc/OCR/dk3iqnq51
  //智障斗图用
  BaiduOcr:{
    APP_ID:     "",
    API_KEY:    "",
    SECRET_KEY: "",
  },
};

export { config };
