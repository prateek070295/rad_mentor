module.exports = {
  testEnvironment: "node",
  transform: {},
  extensionsToTreatAsEsm: [".js"],
  testMatch: ["**/tests/**/*.test.js"],
  setupFilesAfterEnv: ["./tests/jest.setup.js"],
};
