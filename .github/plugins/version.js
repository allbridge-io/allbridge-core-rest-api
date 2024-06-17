const fs = require('fs');

module.exports = {
  verifyConditions: async (pluginConfig, context) => {
    const version = fs.readFileSync(pluginConfig.file, 'utf8').trim();
    context.nextRelease = {
      ...context.nextRelease,
      version
    };
  }
};
