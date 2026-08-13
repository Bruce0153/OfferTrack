const Contract = require('../application-contract.js');

function installPreBackground(ctx, options = {}) {
  ctx.OfferTrackApplicationContract = Contract;
  ctx.OfferTrackCredentialStore = options.credentials || {
    harden: async () => {},
    migrateLegacySecret: async () => {},
    getSecret: async () => options.secret || 's'
  };
  ctx.OfferTrackHostAccess = options.hostAccess || {
    has: async () => options.allowHost !== false,
    request: async () => options.allowHost !== false
  };
  return ctx;
}

function installFollowUpDeps(ctx) {
  ctx.OfferTrackStatusStateMachine = require('../status-state-machine.js');
  ctx.OfferTrackFollowUpCore = require('../followup-core.js');
  ctx.OfferTrackProviderRegistry = require('../provider-registry.js');
  ctx.OfferTrackApplicationData = require('../application-data.js');
  ctx.OfferTrackApplicationMatcher = require('../application-matcher.js');
  ctx.OfferTrackFollowUpStrategy = require('../followup-strategy.js');
  ctx.OfferTrackFollowUpDecision = require('../followup-decision.js');
  return ctx;
}

module.exports = {
  Contract,
  fieldNames: Object.values(Contract.FEISHU_FIELDS),
  installPreBackground,
  installFollowUpDeps
};
