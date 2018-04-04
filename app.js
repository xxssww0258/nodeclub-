/*!
 * nodeclub - app.js
 */

/**
 * Module dependencies.
 */

var config = require('./config');

if (!config.debug && config.oneapm_key) {
  require('oneapm');
}

require('colors');//colors.js  控制颜色打印的模块
var path = require('path');//路径模块
var Loader = require('loader');//静态资源加载器
var LoaderConnect = require('loader-connect')//目前支持.less、.styl编译为CSS文件。.coffee、.es编译为普通的JavaScript文件
var express = require('express');//著名的express框架
var session = require('express-session');//express-session 配合 passport的
var passport = require('passport');//第三方认证  或 本地认证的
require('./middlewares/mongoose_log'); // 打印 mongodb 查询日志
require('./models');//表模块
var GitHubStrategy = require('passport-github').Strategy;//配合passport
var githubStrategyMiddleware = require('./middlewares/github_strategy');
var webRouter = require('./web_router');//页面路由
var apiRouterV1 = require('./api_router_v1');//api路由
var auth = require('./middlewares/auth');
var errorPageMiddleware = require('./middlewares/error_page');//渲染404错误页 和 err错误页
var proxyMiddleware = require('./middlewares/proxy');
var RedisStore = require('connect-redis')(session);
var _ = require('lodash');
var csurf = require('csurf');//使用csurf来阻止CSRF攻击 这个东西好像只能用在node的渲染引擎上
var compress = require('compression');//压缩插件
var bodyParser = require('body-parser');//post请求的必备东西
var busboy = require('connect-busboy');//文件上传的模块
var errorhandler = require('errorhandler');//开发环境下的调试 错误报告
var cors = require('cors');//允许跨域请求的模块
var requestLog = require('./middlewares/request_log');//引入请求的时间的自定义中间件
var renderMiddleware = require('./middlewares/render');//引入渲染时间的自定义插件
var logger = require('./common/logger');//引入打印中间件
var helmet = require('helmet');//安全性相关的HTTP头的插件
var bytes = require('bytes')//一个把给定的数字转换成kb mb gb tb等字符串的模块


// 静态文件目录
var staticDir = path.join(__dirname, 'public');
// assets
var assets = {};

if (config.mini_assets) {
  try {
    assets = require('./assets.json');
  } catch (e) {
    logger.error('You must execute `make build` before start app when mini_assets is true.');
    throw e;
  }
}

var urlinfo = require('url').parse(config.host);//得到一个url对象
config.hostname = urlinfo.hostname || config.host;//www.baidu.com

var app = express();//启动express服务

// configuration in all env
app.set('views', path.join(__dirname, 'views'));//模板文件路径
app.set('view engine', 'html');//html
app.engine('html', require('ejs-mate'));//html用ejs编译
app.locals._layoutFile = 'layout.html';//挂载一个全局字符串
app.enable('trust proxy');//启用信任代理 X-Forwarded-*

// Request logger。请求时间
app.use(requestLog);

if (config.debug) {
  // 渲染时间
  app.use(renderMiddleware.render);
}

// 静态资源
if (config.debug) {
  app.use(LoaderConnect.less(__dirname)); // 测试环境用，编译 .less on the fly
}
app.use('/public', express.static(staticDir));//暴露静态目录
app.use('/agent', proxyMiddleware.proxy);

// 通用的中间件
app.use(require('response-time')());
app.use(helmet.frameguard('sameorigin'));
app.use(bodyParser.json({limit: '1mb'}));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.use(require('method-override')());
app.use(require('cookie-parser')(config.session_secret));
app.use(compress());
app.use(session({
  secret: config.session_secret,
  store: new RedisStore({
    port: config.redis_port,
    host: config.redis_host,
    db: config.redis_db,
    pass: config.redis_password,
  }),
  resave: false,
  saveUninitialized: false,
}));

// oauth 中间件
app.use(passport.initialize());

// github oauth
passport.serializeUser(function (user, done) {
  done(null, user);
});
passport.deserializeUser(function (user, done) {
  done(null, user);
});
passport.use(new GitHubStrategy(config.GITHUB_OAUTH, githubStrategyMiddleware));

// custom middleware
app.use(auth.authUser);
app.use(auth.blockUser());

if (!config.debug) {
  app.use(function (req, res, next) {
    if (req.path === '/api' || req.path.indexOf('/api') === -1) {//所有的渲染页面使用csurf进行保护
      csurf()(req, res, next);
      return;
    }
    next();
  });
  app.set('view cache', true);
}

// for debug
// app.get('/err', function (req, res, next) {
//   next(new Error('haha'))
// });

// set static, dynamic helpers
_.extend(app.locals, {
  config: config,
  Loader: Loader,
  assets: assets
});

app.use(errorPageMiddleware.errorPage);
_.extend(app.locals, require('./common/render_helper'));
app.use(function (req, res, next) {
  res.locals.csrf = req.csrfToken ? req.csrfToken() : '';
  next();
});

app.use(busboy({
  limits: {
    fileSize: bytes(config.file_limit)
  }
}));

// routes
app.use('/api/v1', cors(), apiRouterV1);
app.use('/', webRouter);

// error handler
if (config.debug) {
  app.use(errorhandler());
} else {
  app.use(function (err, req, res, next) {
    logger.error(err);
    return res.status(500).send('500 status');
  });
}

if (!module.parent) {
  app.listen(config.port, function () {
    logger.info('NodeClub listening on port', config.port);
    logger.info('God bless love....');
    logger.info('You can debug your app with http://' + config.hostname + ':' + config.port);
    logger.info('');
  });
}

module.exports = app;
