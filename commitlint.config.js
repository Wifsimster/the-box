module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [
            2,
            'always',
            [
                'feat',     // New feature
                'fix',      // Bug fix
                'docs',     // Documentation changes
                'style',    // Code style changes (formatting, semicolons, etc.)
                'refactor', // Code refactoring
                'perf',     // Performance improvements
                'test',     // Adding or updating tests
                'build',    // Build system or dependencies
                'ci',       // CI/CD changes
                'chore',    // Other changes (maintenance, etc.)
                'revert',   // Revert a previous commit
            ],
        ],
        'subject-case': [0], // Allow any case for subject
        'subject-full-stop': [0], // Allow full stop at end
    },
}
