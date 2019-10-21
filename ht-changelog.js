#!/usr/bin/env node
const cwd = process.cwd();
const path = require("path");
const _ = require("lodash");
const meow = require("meow");
const projectName = require(path.resolve(cwd, "./package.json")).name;
const fs = require("fs-extra");

const types = {
    fix: {
        name: "fix",
        regexp: /fix:|fix\([a-zA-Z0-9\u4e00-\u9fa5-_]*\):/
    },
    feat: {
        name: "feat",
        regexp: /feat:|feat\([a-zA-Z0-9\u4e00-\u9fa5-_]*\):/
    },
    refactor: {
        name: "refactor",
        regexp: /refactor:|refactor\([a-zA-Z0-9\u4e00-\u9fa5-_]*\):/
    },
    style: {
        name: "style",
        regexp: /style:|style\([a-zA-Z0-9\u4e00-\u9fa5-_]*\):/
    },
    chore: {
        name: "chore",
        regexp: /chore:|chore\([a-zA-Z0-9\u4e00-\u9fa5-_]*\):/
    },
};

let commitLogPath = "commitLog"

const cli = meow(`
    Usage: 
        ht-changelog commit_log_path
    flags:
        --filter -f regexp: filter commit message by a regexp
        --print -p: print the change log instead of write it into changelog.md
`, {
    flags: {
        filter: {
            type: "string",
            alias: "f"
        },
        print: {
            type: "boolean",
            alias: "p"
        }
    }
})

if (cli.input[0]) {
    commitLogPath = cli.input[0];
}

const commitLog = require(path.resolve(cwd, commitLogPath));

function filterCommits(commits) {
    const regexp = new RegExp(cli.flags.filter);
    return commits.filter(commit => regexp.test(commit.message))
}

function classifyCommits(commits) {
    return filterCommits(commits)
        .reduce((accum, cur) => {
            const { message } = cur;
            const categoryMatchers = _.values(types)
            for (const matcher of categoryMatchers) {
                const { name, regexp } = matcher;
                if (regexp.test(message)) {
                    accum[name].push(cur)
                }
            }
            return accum;
        }, {
            [types.fix.name]: [],
            [types.feat.name]: [],
            [types.refactor.name]: [],
            [types.style.name]: [],
            [types.chore.name]: [],
        })
}

function groupCommitsByVersion(commits) {
    return _.groupBy(commits, "version");
}

function groupCommits(commits) {
    const groupedByVersion = groupCommitsByVersion(commits);
    return _.mapValues(groupedByVersion, value => classifyCommits(value));
}


function generateChangeLog(commits) {

    const lines = [];
    function appendLine(text) {
        lines.push(text);
        lines.push("\n")
    }
    // title
    const title = projectName ? `# ${projectName}` : "# Change Log"
    appendLine(title);

    const groupedCommits = groupCommits(commits);
    const groupedByVersion = groupCommitsByVersion(commits);
    const versions = _.keys(groupedCommits);
    for (const version of versions) {
        //version

        const versionDate = new Date(groupedByVersion[version][0].date);
        const dateString = `${versionDate.getFullYear()}-${versionDate.getMonth() + 1}-${versionDate.getDate()}`
        const versionText = `## v-${version} (${dateString})`;
        appendLine(versionText);

        // type title
        const commitTypes = _.keys(groupedCommits[version]);

        for (const type of commitTypes) {

            const typedCommits = groupedCommits[version][type];

            if (!_.isEmpty(typedCommits)) {

                const typeText = `### ${type}`;
                appendLine(typeText)

                for (const commit of typedCommits) {
                    const { message, auth } = commit;
                    const logMessage = cleanMessage(message);
                    const messageText = `* ${logMessage}. (auth: ${auth})`;
                    appendLine(messageText)
                }

                lines.push("\n");
            }
        }
        appendLine("---")
    }

    return lines;

}

function cleanMessage(message) {
    const regexp = /^.*?((fix)|(feat)|(style)|(chore)|(refactor))\:?\s/;
    const scopeRegexp = /((fix)|(feat)|(style)|(chore)|(refactor))\([a-zA-Z0-9\u4e00-\u9fa5-_]*\)/;
    const withoutPrefix = message.replace(regexp, "").replace(scopeRegexp, "");
    const scopeMatchResult = message.match(scopeRegexp)
    if (scopeMatchResult) {
        const rawScope = scopeMatchResult[0];
        const scope = rawScope ? rawScope.split(/[\(\)]/)[1] : "";
        return _.compact([scope, withoutPrefix]).join(" ");
    }
    return withoutPrefix;
}



function outputChangeLog() {
    const lines = generateChangeLog(commitLog);
    if (cli.flags.print) {
        for (const line of lines) {
            console.log(line)
        }
    } else {
        const changelogPath = path.resolve(cwd, "changelog.md");
        fs.ensureFileSync(changelogPath)
        let writeStream = fs.createWriteStream(changelogPath);

        for (const line of lines) {
            writeStream.write(line, "utf8");

        }

        writeStream.on('finish', () => {
            console.log('wrote all data to file');
        });

        writeStream.end();
    }

}

outputChangeLog()