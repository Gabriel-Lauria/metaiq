const bcrypt = require('bcryptjs');
const hash = '$2b$12$HYPL3V4isNruAEAwg98u/OvtFXPKwkkPLHTy/eTSFkPOR/o9RRdYq';
(async () => {
  console.log('compare random', await bcrypt.compare('random', hash));
})();
