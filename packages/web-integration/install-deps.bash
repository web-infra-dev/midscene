if [ "$SKIP_DEVTOOLS_POSTINSTALL" = "true" ]; then
    echo "Skipping devtools postinstall script."
    exit 0
fi

if [ "$GITHUB_ACTIONS" = "true" ]; then
    echo "Running in GitHub Actions environment."
    npx playwright install-deps && npx playwright install
else
    echo "Not running in GitHub Actions environment."
fi
