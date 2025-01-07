testDir: "test"
require: "ts-node/register"
timeout: 5000

module.exports = {
    extension: ['ts'],
    spec: 'src/test/**/*.test.ts',
    require: 'ts-node/register',
  };