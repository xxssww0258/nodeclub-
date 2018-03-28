var logger = require('../common/logger');
// 这是一个渲染事件的中间件
// Patch res.render method to output logger
exports.render = function (req, res, next) {
  res._render = res.render;//获取到原本的render方法

  res.render = function (view, options, fn) {//重写render方法
    var t = new Date();//获取当前时间

    res._render(view, options, fn);//渲染

    var duration = (new Date() - t);//得到渲染完成时间
    logger.info("Render view", view, ("(" + duration + "ms)").green);//打印出渲染时间
  };

  next();
};
