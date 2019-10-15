const meow = require("meow");

const cli = meow(`
Usage
  $ foo

Options
  --rainbow, -r  Include a rainbow
  --unicorn, -u  Include a unicorn
  --no-sparkles  Exclude sparkles

Examples
  $ foo
  🌈 unicorns✨🌈
`, {
    booleanDefault: undefined,
    flags: {
        rainbow: {
            type: 'boolean',
            default: true,
            alias: 'r'
        },
        unicorn: {
            type: 'boolean',
            default: false,
            alias: 'u'
        },
        cake: {
            type: 'string',
            alias: 'c'
        },
        sparkles: {
            type: 'boolean',
            default: true
        }
    }
});
console.log(cli)
