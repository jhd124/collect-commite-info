#!/usr/bin/env node
//获得两个版本之间的commit信息
/**
 * usage:
 * command: insert commits between two version into the front of `commitLog.json`
 * command -l: list all the commits between two versions
 * command -c sha1: generate commits between sha1 and latest version
 * command -b sha1 sha2: generate commits between sha1 and sha2
 * command -filter:regexp: filter commits according to commit message with the regular expression
 */
const execCallbackVersion = require("child_process").exec;
const _ = require("lodash");
const path = require("path");
const version = require(path.resolve(process.cwd(), "./package.json")).version;
const fs = require("fs-extra");
const meow = require("meow");

const config = {
    diffIgnore: ["*.svg", "*.lock", "*/lib/*", "commitLog.json"],
    messageFilter: null,
};

const cli = meow(`
    Usage
        commits
    Options
        --list, -l:                  show a list of commits, instead of write commits information
        --current-commit, -c sha1:   generate commits between sha1 and latest version
        --between-two, -b sha1 sha2: generate commits between sha1 and sha2
        --filter -f regexp:          filter commits according to commit message with the regular expression
`, {
    booleanDefault: undefined,
    flags: {
        list: {
            type: "boolean",
            default: false,
            alias: "l",
        },
        "current-commit": {
            type: "boolean",
            default: false,
            alias: "c",
        },
        "between-two": {
            type: "boolean",
            default: false,
            alias: "b"
        },
        "filter": {
            type: "string",
            alias: "f"
        }
    }
})

const option = cli.flags;
const arg1 = cli.input[0];
const arg2 = cli.input[1];

const getVersionChangingCommitsCommand = "git log -G'\"version\": \"[0-9]' --follow ./package.json";
const commitHashReg = /\b[0-9a-f]{40}\b/g;
const commitFormatString = "hash::%H@_@parent::%P@_@auth::%an@_@date::%ad@_@message::%s";
const commitLogFilePath = path.resolve(process.cwd(), "./commitLog.json");

function exec(command) {
    return new Promise((res, rej) => {
        execCallbackVersion(command, function (error, stdout) {
            if (error) {
                rej(error);
            } else {
                res(stdout);
            }
        });
    });
}

function parseCommit(commit) {

    const result = commit.split("@_@")
        .map(info => {
            const [key, value] = info.split("::");
            return { [key]: value };
        })
        .reduce((accum, subMap) => ({ ...accum, ...subMap }), {});
    if (!option.b) {
        result.version = version;
    }
    return result;
}

function insertContribute(commit) {
    const { hash, parent } = commit;
    const diffIgnoreFlag = "-- . " + config.diffIgnore.map(item => `':!${item}'`).join(" ");
    return getContributesBetweenTwoCommits(parent, hash, diffIgnoreFlag)
        .then(contribute => ({ ...commit, ...contribute }));
}

function getContributesBetweenTwoCommits(parent, hash, diffIgnoreFlag) {
    const diffCommand = `git diff ${parent} ${hash} --shortstat ${diffIgnoreFlag}`;
    return exec(diffCommand).then(change => {

        const changeNumbers = change.split(",")
            .map(changeInfo => changeInfo && changeInfo.match(/[0-9]+/)[0])
            .filter(contribute => !!contribute);

        const contribute = {
            insertions: parseInt(changeNumbers[1] || 0, 10),
            deletions: parseInt(changeNumbers[2] || 0, 10),
        };

        return contribute;
    });
}

function insertCommitInfo(commits) {
    const writeOptions = {
        spaces: "\t",
        EOL: "\n",
    };
    if (fs.existsSync(commitLogFilePath)) {
        const commitLog = fs.readJSONSync(commitLogFilePath);
        const nextLog = _.uniqBy([...commits, ...commitLog], "hash");
        fs.writeJSONSync(commitLogFilePath, nextLog, writeOptions);
    } else {
        fs.ensureFileSync(commitLogFilePath);
        fs.writeJSONSync(commitLogFilePath, commits, writeOptions);
    }
}

function filterCommits(commits) {
    let { messageFilter } = config;
    if (option.filter) {
        messageFilter = RegExp(option.filter);
    }
    if (!messageFilter) {
        return commits;
    }
    return commits.filter(commit => messageFilter.test(commit.message));
}

function getCommitInfoBetweenTwoCommits(commitHashes) {

    const [hash1, hash2] = commitHashes;

    let _baseHash = hash2;
    let _topHash = hash1;

    if (option.b) {
        _topHash = arg1;
        _baseHash = arg2;
    }
    if (option.c) {
        _topHash = arg1;
        _baseHash = hash1;
    }

    return exec(`git log ${_baseHash}..${_topHash} --pretty=format:${commitFormatString}`)
        .then(commits => commits.split(/\n+/).filter(commit => !!commit).map(parseCommit))
        .then(filterCommits)
        .then(commitArr => Promise.all(commitArr.map(insertContribute)));
}

const commitInfoPromise = exec(getVersionChangingCommitsCommand)
    .then(stdout => _.take(stdout.match(commitHashReg), 2))
    .then(getCommitInfoBetweenTwoCommits);

if (option.l) {
    // eslint-disable-next-line
    commitInfoPromise.then(console.log);
} else {
    commitInfoPromise.then(insertCommitInfo);
}


