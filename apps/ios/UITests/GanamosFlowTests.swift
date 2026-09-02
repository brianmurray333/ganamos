import XCTest

final class GanamosFlowTests: XCTestCase {
    @MainActor
    func testSignedOutCoreNavigation() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--ganamos-reset-session", "--ganamos-disable-auto-camera"]
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["Wallet"].firstMatch.waitForExistence(timeout: 15))
        tapTab(.new, in: app)
        XCTAssertTrue(app.buttons["Take Photo"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Choose from Photos"].exists)

        tapTab(.wallet, in: app)
        XCTAssertTrue(app.staticTexts["Sign up to access your wallet"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Sign up"].exists)
        XCTAssertTrue(app.buttons["Log in"].exists)
    }

    @MainActor
    func testAuthenticationOptionsAndLocalValidationWithoutSubmitting() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "authentication"
        app.launch()

        XCTAssertTrue(app.staticTexts["Welcome back"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Sign in with Google"].exists)
        XCTAssertTrue(app.buttons["Sign in with email"].exists)
        XCTAssertTrue(app.buttons["Sign in with phone"].exists)

        let loginEmail = app.textFields["Email"]
        tap(app.buttons["Sign in with email"], until: loginEmail)
        let loginPassword = app.secureTextFields["Password"]
        let login = app.buttons["Log in"]
        XCTAssertFalse(login.isEnabled)
        loginEmail.tap()
        loginEmail.typeText("regression@ganamos.earth")
        loginPassword.tap()
        loginPassword.typeText("not-submitted")
        XCTAssertTrue(login.isEnabled)

        tap(app.buttons["Forgot password?"], until: app.staticTexts["Forgot your password?"])
        dismissPasswordSavePromptIfNeeded(in: app, shouldExpectPrompt: true)
        XCTAssertTrue(app.buttons["Send reset link"].isEnabled)
        tap(app.buttons["Back to login"], until: app.buttons["Back to all sign in options"])
        tap(app.buttons["Back to all sign in options"], until: app.buttons["Sign in with phone"])

        let phone = app.textFields["Phone number (for example, +1 555 123 4567)"]
        tap(app.buttons["Sign in with phone"], until: phone)
        let sendCode = app.buttons["Send verification code"]
        XCTAssertFalse(sendCode.isEnabled)
        phone.tap()
        phone.typeText("4155550123")
        XCTAssertTrue(sendCode.isEnabled)
        tap(app.buttons["Back to all sign in options"], until: app.buttons["Sign up"])

        tap(app.buttons["Sign up"], until: app.buttons["Sign up with email"])
        tap(app.buttons["Sign up with email"], until: app.textFields["Name"])
        let createAccount = app.buttons["Create account"]
        XCTAssertFalse(createAccount.isEnabled)
        app.textFields["Name"].tap()
        app.textFields["Name"].typeText("Regression User")
        app.textFields["Email"].tap()
        app.textFields["Email"].typeText("regression@ganamos.earth")
        let createPassword = app.secureTextFields["Create a password"]
        createPassword.tap()
        createPassword.typeText("1234567")
        XCTAssertFalse(createAccount.isEnabled)
        createPassword.typeText("8")
        XCTAssertTrue(createAccount.isEnabled)
        capture("authentication-local-validation-no-submit", app: app)

        // Do not select any Google, login, reset, SMS, verification, or account
        // creation action. All assertions above are local and non-mutating.
    }

    @MainActor
    func testAuthenticatedCoreNavigationWhenCredentialsAreProvided() throws {
        let accessToken = regressionValue("GANAMOS_TEST_ACCESS_TOKEN")
        let refreshToken = regressionValue("GANAMOS_TEST_REFRESH_TOKEN")
        let userID = regressionValue("GANAMOS_TEST_USER_ID")
        let email = regressionValue("GANAMOS_TEST_EMAIL")
        let password = regressionValue("GANAMOS_TEST_PASSWORD")
        let hasTokenSession = [accessToken, refreshToken, userID].allSatisfy { !($0 ?? "").isEmpty }
        let hasPasswordSession = !(email ?? "").isEmpty && !(password ?? "").isEmpty
        let app = XCUIApplication()
        app.launchArguments += ["--ganamos-disable-auto-camera"]
        if hasTokenSession {
            app.launchArguments += [
                "--ganamos-test-access-token", accessToken!,
                "--ganamos-test-refresh-token", refreshToken!,
                "--ganamos-test-user-id", userID!
            ]
            if let email { app.launchArguments += ["--ganamos-test-user-email", email] }
        } else if hasPasswordSession {
            app.launchArguments += ["--ganamos-reset-session"]
        }
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["Wallet"].firstMatch.waitForExistence(timeout: 15))
        if hasPasswordSession && !hasTokenSession {
            XCTAssertTrue(app.buttons["Sign In"].waitForExistence(timeout: 5))
            app.buttons["Sign In"]
                .coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
                .tap()
            if !app.buttons["Sign in with email"].waitForExistence(timeout: 3) {
                app.buttons["Sign In"]
                    .coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
                    .tap()
            }
            XCTAssertTrue(app.buttons["Sign in with email"].waitForExistence(timeout: 5))
            app.buttons["Sign in with email"]
                .coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
                .tap()
            XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 5))
            app.textFields["Email"].tap()
            app.textFields["Email"].typeText(email!)
            app.secureTextFields["Password"].tap()
            app.secureTextFields["Password"].typeText(password!)
            app.buttons["Log in"]
                .coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
                .tap()
        } else if app.buttons["Sign In"].waitForExistence(timeout: 3) {
            throw XCTSkip(
                "Authenticated regression requires a stored simulator session or GANAMOS_TEST credentials."
            )
        }
        XCTAssertTrue(app.buttons["Sign In"].waitForNonExistence(timeout: 45), "Regression sign-in did not complete")
        dismissPasswordSavePromptIfNeeded(
            in: app,
            shouldExpectPrompt: hasPasswordSession && !hasTokenSession
        )
        capture("authenticated-home", app: app)

        tapTab(.map, in: app)
        XCTAssertTrue(app.maps.firstMatch.waitForExistence(timeout: 15))
        capture("map", app: app)

        tapTab(.wallet, in: app)
        XCTAssertTrue(app.staticTexts["Current Balance"].waitForExistence(timeout: 15))
        capture("wallet", app: app)

        let receive = app.buttons["Receive"]
        receive.tap()
        let receiveAmount = app.textFields["walletReceiveAmount"]
        if !receiveAmount.waitForExistence(timeout: 2) {
            // The iOS 26 glass wallet action can acknowledge a semantic tap
            // without presenting its sheet while the simulator is busy.
            receive.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(receiveAmount.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["walletCreateInvoice"].isEnabled)
        receiveAmount.tap()
        if !app.keyboards.firstMatch.waitForExistence(timeout: 2) {
            // A busy iOS 26 simulator can acknowledge the semantic tap while
            // leaving the number field without keyboard focus.
            receiveAmount.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        receiveAmount.typeText("99")
        XCTAssertFalse(app.buttons["walletCreateInvoice"].isEnabled)
        receiveAmount.typeText("1")
        XCTAssertTrue(app.buttons["walletCreateInvoice"].isEnabled)
        app.buttons["Dismiss keyboard"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
        capture("wallet-receive-validated", app: app)
        app.buttons["Close"].tap()

        XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 5))
        app.buttons["Send"].tap()
        XCTAssertTrue(app.textFields["walletSendRecipient"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["walletReviewPayment"].isEnabled)
        capture("wallet-send-empty", app: app)
        app.buttons["Close"].tap()

        tapTab(.profile, in: app)
        XCTAssertTrue(app.staticTexts["Account settings"].firstMatch.waitForExistence(timeout: 15))
        capture("profile", app: app)

        tapTab(.new, in: app)
        XCTAssertTrue(app.buttons["Take Photo"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Choose from Photos"].exists)
        capture("new-issue-photo", app: app)

        app.terminate()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "newIssueDetails"
        app.launchArguments += ["--ganamos-new-issue-details"]
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["newIssueDescription"].waitForExistence(timeout: 5))
        capture("new-issue-details", app: app)
    }

    @MainActor
    func testAuthenticatedProfileDestinationsWhenSessionIsAvailable() throws {
        let accessToken = regressionValue("GANAMOS_TEST_ACCESS_TOKEN")
        let refreshToken = regressionValue("GANAMOS_TEST_REFRESH_TOKEN")
        let userID = regressionValue("GANAMOS_TEST_USER_ID")
        let hasTokenSession = [accessToken, refreshToken, userID].allSatisfy { !($0 ?? "").isEmpty }
        let app = XCUIApplication()
        app.launchArguments += ["--ganamos-disable-auto-camera"]
        if hasTokenSession {
            app.launchArguments += [
                "--ganamos-test-access-token", accessToken!,
                "--ganamos-test-refresh-token", refreshToken!,
                "--ganamos-test-user-id", userID!
            ]
        }
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["Wallet"].firstMatch.waitForExistence(timeout: 15))
        if app.buttons["Sign In"].waitForExistence(timeout: 3) {
            throw XCTSkip(
                "Authenticated Profile regression requires a stored simulator session or GANAMOS_TEST token credentials."
            )
        }

        tapTab(.profile, in: app)
        if !app.staticTexts["Account settings"].firstMatch.waitForExistence(timeout: 3) {
            tapTab(.profile, in: app)
        }
        XCTAssertTrue(app.staticTexts["Account settings"].firstMatch.waitForExistence(timeout: 15))

        openProfileDestination("Account settings", navigationTitle: "Account settings", in: app)
        XCTAssertTrue(app.textFields["accountName"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.textFields["accountUsername"].exists)
        capture("authenticated-account-settings-read-only", app: app)
        returnToProfile(from: "Account settings", in: app)

        openProfileDestination("Groups", navigationTitle: "Groups", in: app)
        XCTAssertTrue(app.buttons["Find a group..."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Create Group"].exists)
        capture("authenticated-groups-read-only", app: app)
        returnToProfile(from: "Groups", in: app)

        openProfileDestination("Activity", navigationTitle: "Activity", in: app)
        capture("authenticated-activity-read-only", app: app)
        returnToProfile(from: "Activity", in: app)

        openProfileDestination("Posts", navigationTitle: "Your Posts", in: app)
        XCTAssertTrue(app.segmentedControls.firstMatch.waitForExistence(timeout: 10))
        capture("authenticated-posts-read-only", app: app)
        returnToProfile(from: "Your Posts", in: app)

        let pet = app.buttons["Satoshi pet"].firstMatch
        XCTAssertTrue(pet.waitForExistence(timeout: 5))
        pet.tap()
        XCTAssertTrue(app.navigationBars["Satoshi pet"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Your Bitcoin companion"].exists)
        capture("authenticated-pet-hub-read-only", app: app)

        // Every destination above is read-only. Do not save account settings,
        // join/create a group, open a protected pet flow, or mutate a post.
    }

    @MainActor
    func testNewIssueDetailsSupportsLocationDeadlineAndSafeRewardConfiguration() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "newIssueDetails"
        app.launchArguments += ["--ganamos-new-issue-details", "--ganamos-disable-auto-camera"]
        app.launch()

        let description = app.descendants(matching: .any)["newIssueDescription"]
        XCTAssertTrue(description.waitForExistence(timeout: 10))
        XCTAssertTrue(app.descendants(matching: .any)["newIssueLocation"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["newIssueDeadline"].exists)
        XCTAssertFalse(app.buttons["Post"].isEnabled)

        description.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)).tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        description.typeText("Regression-only neighborhood cleanup issue")
        XCTAssertTrue(app.buttons["Post"].isEnabled)
        dismissKeyboard(in: app)

        let deadline = app.descendants(matching: .any)["newIssueDeadline"]
        let oneHour = app.buttons["1 hour"]
        deadline.tap()
        if !oneHour.waitForExistence(timeout: 2) {
            // Under full-suite simulator load, iOS 26 can acknowledge the
            // semantic menu tap without presenting the menu on the first try.
            deadline.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(oneHour.waitForExistence(timeout: 5))
        oneHour.tap()

        app.swipeUp()
        let decreaseReward = app.buttons["Decrease reward"]
        XCTAssertTrue(decreaseReward.waitForExistence(timeout: 3))
        decreaseReward.tap()
        decreaseReward.tap()
        decreaseReward.tap()
        XCTAssertTrue(app.staticTexts["500"].waitForExistence(timeout: 3))
        capture("new-issue-configured-500-sats", app: app)
    }

    @MainActor
    func testDonateValidationAndKeyboardDismissalWithoutCreatingInvoice() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "donate"
        app.launch()

        XCTAssertTrue(app.staticTexts["Donation Amount"].waitForExistence(timeout: 10))
        let amount = app.textFields["donationCustomAmount"]
        let chooseLocation = app.buttons["donationChooseLocation"]
        XCTAssertTrue(amount.exists)
        amount.tap()
        if !app.keyboards.firstMatch.waitForExistence(timeout: 2) {
            amount.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        amount.typeText("99")
        XCTAssertFalse(chooseLocation.isEnabled)
        XCTAssertTrue(app.buttons["Dismiss keyboard"].waitForExistence(timeout: 3))
        amount.typeText("1")
        XCTAssertTrue(chooseLocation.isEnabled)
        dismissKeyboard(in: app)

        chooseLocation.tap()
        if !app.staticTexts["Pick Location"].waitForExistence(timeout: 2) {
            // A busy iOS 26 simulator can occasionally acknowledge the
            // semantic XCUI tap without delivering it to a glass button.
            chooseLocation.tap()
        }
        XCTAssertTrue(app.staticTexts["Pick Location"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["donationCreateInvoice"].isEnabled)
        let donorName = app.textFields["donationDonorName"]
        donorName.tap()
        if !app.keyboards.firstMatch.waitForExistence(timeout: 2) {
            donorName.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        donorName.typeText("Regression Donor")
        dismissKeyboard(in: app)
        capture("donate-ready-no-invoice", app: app)
        // Do not select Create invoice. The deterministic preview validates the
        // reversible composer states without creating or paying a live invoice.
    }

    @MainActor
    func testMapSearchRewardFilterAndDonateNavigation() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "map"
        app.launch()

        XCTAssertTrue(app.maps.firstMatch.waitForExistence(timeout: 10))
        let rewardedPost = app.descendants(matching: .any)["mapPost-00000000-0000-0000-0000-000000000301"]
        let unrewardedPost = app.descendants(matching: .any)["mapPost-00000000-0000-0000-0000-000000000302"]
        XCTAssertTrue(rewardedPost.waitForExistence(timeout: 5))
        XCTAssertTrue(unrewardedPost.exists)
        let search = app.textFields["mapSearch"]
        XCTAssertTrue(search.exists)
        search.tap()
        search.typeText("Oakland")
        let clearSearch = app.buttons["mapClearSearch"]
        XCTAssertTrue(clearSearch.waitForExistence(timeout: 3))
        clearSearch.tap()
        if !clearSearch.waitForNonExistence(timeout: 2) {
            clearSearch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(clearSearch.waitForNonExistence(timeout: 3))
        app.buttons["Dismiss keyboard"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))

        let rewardFilter = app.buttons["mapRewardedOnly"]
        XCTAssertTrue(rewardFilter.exists)
        XCTAssertEqual(rewardFilter.value as? String, "Off")
        rewardFilter.tap()
        if !rewardFilter.waitForValue("On", timeout: 2) {
            rewardFilter.tap()
        }
        XCTAssertEqual(rewardFilter.value as? String, "On")
        XCTAssertTrue(rewardedPost.exists)
        XCTAssertTrue(unrewardedPost.waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.buttons["mapShowAll"].exists)
        app.buttons["mapShowAll"].tap()
        capture("map-rewarded-filter", app: app)

        let donate = app.buttons["mapDonate"]
        let donationAmount = app.staticTexts["Donation Amount"]
        donate.tap()
        if !donationAmount.waitForExistence(timeout: 2) {
            // A busy iOS 26 Map can occasionally acknowledge an XCUI tap
            // without delivering it to a SwiftUI glass button.
            donate.tap()
        }
        XCTAssertTrue(donationAmount.waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["donationCustomAmount"].exists)
        capture("map-donate-entry", app: app)
        // Stop before entering an amount or creating an invoice.
    }

    @MainActor
    func testNewIssueLocationDenialIsRecoverable() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "newIssueDetails"
        app.launchArguments += ["--ganamos-new-issue-details", "--ganamos-disable-auto-camera"]

        app.launch()
        XCTAssertTrue(app.buttons["Use current location"].waitForExistence(timeout: 10))
        app.buttons["Use current location"].tap()

        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deny = springboard.buttons.matching(
            NSPredicate(format: "label IN %@", ["Don’t Allow", "Don't Allow"])
        ).firstMatch
        // On the compact iOS 17 simulator the system permission sheet can
        // arrive a few seconds after the app-side location request. Waiting
        // only one second leaves the sheet queued for the next test and never
        // delivers the denial callback that produces the recoverable state.
        if deny.waitForExistence(timeout: 5) { deny.tap() }

        let message = app.staticTexts["Location is unavailable. You can enter it manually."]
        XCTAssertTrue(message.waitForExistence(timeout: 10))
        XCTAssertTrue(app.descendants(matching: .any)["newIssueLocation"].exists)
        capture("new-issue-location-denied", app: app)
    }

    @MainActor
    func testNewIssueCameraDenialOffersPhotoLibraryRecovery() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "newIssuePhoto"
        app.launchArguments += [
            "--ganamos-disable-auto-camera",
            "--ganamos-camera-denied"
        ]
        app.launch()

        XCTAssertTrue(app.buttons["Choose from Photos"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.descendants(matching: .any)["newIssueCameraError"].exists)
        XCTAssertTrue(app.staticTexts["Camera access is unavailable. Choose a photo from your library instead."].exists)
        capture("new-issue-camera-denied", app: app)
    }

    @MainActor
    func testOwnerReviewAndCloseConfirmationsAreSafe() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "postReview"
        app.launchArguments += ["--ganamos-disable-auto-camera"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Fix submitted"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Cleaned the full trail and sorted recyclables."].exists)
        XCTAssertTrue(app.staticTexts["500"].exists)
        let rejectSheet = app.navigationBars["Reject fix"]
        app.buttons["Reject"].tap()
        if !rejectSheet.waitForExistence(timeout: 2) {
            // iOS 26 can occasionally acknowledge an XCUI tap without
            // delivering it to a SwiftUI button during a busy full suite.
            app.buttons["Reject"].tap()
        }
        XCTAssertTrue(rejectSheet.waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["Reason (optional)"].exists)
        capture("owner-review-reject", app: app)
        dismiss(app.buttons["Cancel"], until: rejectSheet)

        let approve = app.buttons["Approve"]
        XCTAssertTrue(approve.waitUntilHittable(timeout: 5))
        tap(approve, until: app.buttons["Approve and release reward"])
        XCTAssertTrue(app.staticTexts["This action credits the fixer and cannot be undone."].exists)
        capture("owner-review-approval-confirmation", app: app)

        app.terminate()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "postOwnerOpen"
        app.launch()
        XCTAssertTrue(app.buttons["Mark Complete"].waitForExistence(timeout: 10))
        tap(app.buttons["Mark Complete"], until: app.navigationBars["Mark Complete"])
        let username = app.textFields["username"]
        XCTAssertTrue(username.exists)
        XCTAssertFalse(app.buttons["Review and close issue"].isEnabled)
        username.tap()
        username.typeText("regression-fixer")
        XCTAssertTrue(app.buttons["Review and close issue"].isEnabled)
        app.buttons["Review and close issue"].tap()
        XCTAssertTrue(app.buttons["Close issue and send reward"].waitForExistence(timeout: 5))
        capture("owner-close-500-sat-confirmation", app: app)
        // Leave the final confirmation open. Test teardown terminates the app,
        // which guarantees no reward action is selected.
    }

    @MainActor
    func testSubmitFixValidationAndKeyboardDismissal() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "submitFix"
        app.launchArguments += ["--ganamos-disable-auto-camera"]
        app.launch()

        let proof = app.descendants(matching: .any)["submitFixProof"]
        XCTAssertTrue(proof.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["submitFixButton"].isEnabled)
        for _ in 0..<5 where !proof.isHittable { app.swipeUp() }
        XCTAssertTrue(proof.isHittable)
        for verticalOffset in [0.22, 0.5, 0.78] {
            proof.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: verticalOffset)).tap()
            if app.keyboards.firstMatch.waitForExistence(timeout: 1) { break }
        }
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        proof.typeText("Removed the litter and sorted recyclables.")
        XCTAssertTrue(app.buttons["submitFixButton"].isEnabled)
        XCTAssertTrue(app.buttons["Dismiss keyboard"].waitForExistence(timeout: 3))
        app.buttons["Dismiss keyboard"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["The reward stays locked until the owner reviews and approves your submission."].exists)
        capture("submit-fix-ready-no-submit", app: app)
    }

    @MainActor
    func testFeedLoadingErrorAndEmptyStates() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "feedLoading"
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["feedLoadingState"].waitForExistence(timeout: 10))
        capture("feed-loading", app: app)

        app.terminate()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "feedError"
        app.launch()
        XCTAssertTrue(app.staticTexts["Couldn’t load fixes"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Check your connection and try again."].exists)
        capture("feed-error", app: app)

        app.terminate()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "feedEmpty"
        app.launch()
        XCTAssertTrue(app.staticTexts["No open fixes"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Try another search or check back soon."].exists)
        capture("feed-empty", app: app)
    }

    @MainActor
    func testHomeBalanceMatchesMobileWebPresentation() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "feedAuthenticated"
        app.launch()

        let balance = app.descendants(matching: .any).matching(identifier: "home-balance-badge").firstMatch
        XCTAssertTrue(balance.waitForExistence(timeout: 10))
        XCTAssertEqual(balance.label, "Balance: 27.9k sats")
        capture("home-balance-web-parity", app: app)
    }

    @MainActor
    func testHomeBalanceMenuSwitchesConnectedAccountsWithoutMutation() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "feedAccountSwitcher"
        app.launch()

        var accountMenu = app.buttons["homeAccountMenu"].firstMatch
        XCTAssertTrue(accountMenu.waitForExistence(timeout: 10))
        XCTAssertTrue(accountMenu.label.contains("27,900 sats"))
        tap(accountMenu, until: app.buttons["View Wallet"])

        XCTAssertTrue(app.buttons["View Wallet"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Alexandria Montgomery"].exists)
        XCTAssertTrue(app.buttons["Marlowe"].exists)
        XCTAssertTrue(app.buttons["Brynn"].exists)
        capture("home-account-menu-main", app: app)

        app.buttons["Marlowe"].tap()
        accountMenu = app.buttons["homeAccountMenu"].firstMatch
        XCTAssertTrue(accountMenu.waitForExistence(timeout: 3))
        XCTAssertTrue(accountMenu.label.contains("60,600 sats"))

        tap(accountMenu, until: app.buttons["Marlowe"])
        XCTAssertTrue(app.buttons["Marlowe"].waitForExistence(timeout: 3))
        capture("home-account-menu-child", app: app)
        app.buttons["Alexandria Montgomery"].tap()

        accountMenu = app.buttons["homeAccountMenu"].firstMatch
        XCTAssertTrue(accountMenu.waitForExistence(timeout: 3))
        XCTAssertTrue(accountMenu.label.contains("27,900 sats"))

        // The fixture intentionally includes only owner-connected child
        // accounts. Quick contacts never enter the global account switcher,
        // and no API request or account mutation is issued by these actions.
        XCTAssertFalse(app.buttons["Charlotte"].exists)
    }

    @MainActor
    func testProfileMatchesMobileWebHierarchyAndQRCode() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profile"
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["profileIdentityCard"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.navigationBars.firstMatch.exists)
        XCTAssertTrue(app.descendants(matching: .any)["profileFamilyCard"].exists)
        let balance = app.buttons["Open wallet, balance 27.9k sats"]
        XCTAssertTrue(balance.exists)
        XCTAssertEqual(app.staticTexts["profileUsdBalance"].label, "$22")
        XCTAssertTrue(app.buttons["My QR code"].exists)
        let connectedPet = app.buttons["Open pup settings"]
        XCTAssertTrue(connectedPet.exists)
        XCTAssertEqual(connectedPet.label, "Open pup settings")
        XCTAssertEqual(connectedPet.value as? String, "/pet-settings")
        XCTAssertTrue(app.images["profilePetIcon-dog.fill"].exists)
        XCTAssertTrue(app.staticTexts["pup"].exists)
        XCTAssertFalse(app.staticTexts["Satoshi pet"].exists)
        XCTAssertTrue(app.staticTexts["60k"].exists)
        XCTAssertFalse(app.staticTexts["60.6k"].exists)
        // The web baseline keeps all four family columns within the mobile
        // container. Assert the populated tile remains fully on-screen so the
        // same hierarchy cannot silently clip on compact iPhones.
        XCTAssertTrue(app.buttons["Send sats to Marlowe"].frame.maxX <= app.frame.maxX)
        XCTAssertTrue(app.staticTexts["Account settings"].exists)
        XCTAssertTrue(app.staticTexts["Groups"].exists)
        XCTAssertTrue(app.staticTexts["Activity"].exists)
        XCTAssertTrue(app.staticTexts["Posts"].exists)
        XCTAssertFalse(app.staticTexts["Admin"].exists)
        XCTAssertFalse(app.staticTexts["Family accounts"].exists)
        capture("profile-mobile-web-parity", app: app)

        let marlowe = app.buttons["Send sats to Marlowe"]
        XCTAssertTrue(marlowe.waitUntilHittable(timeout: 5))
        tap(marlowe, until: app.navigationBars["Send"])
        let recipient = app.textFields["walletSendRecipient"]
        XCTAssertTrue(recipient.exists)
        XCTAssertEqual(recipient.value as? String, "marlowe")
        XCTAssertFalse(app.buttons["walletReviewPayment"].isEnabled)
        capture("profile-family-native-send", app: app)
        dismiss(app.buttons["Close"], until: app.navigationBars["Send"])

        tap(app.buttons["My QR code"], until: app.navigationBars["My QR Code"])
        let qrNavigationBar = app.navigationBars["My QR Code"]
        XCTAssertTrue(qrNavigationBar.waitForExistence(timeout: 10))
        let qrName = app.staticTexts["profileQRCodeName"]
        XCTAssertTrue(qrName.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(
            qrName.frame.minY,
            qrNavigationBar.frame.maxY,
            "QR identity copy must not overlap the native navigation title")
        let qrIdentity = app.staticTexts["profileQRCodeIdentity"]
        XCTAssertTrue(qrIdentity.exists)
        XCTAssertEqual(qrIdentity.label, "@alexandria-community-builder")
        XCTAssertTrue(app.buttons["profileQRCodeEditUsername"].exists)
        let copyUsername = app.buttons["Copy username"]
        XCTAssertTrue(copyUsername.exists)
        // Compact iOS 17 can occasionally drop the first synthesized tap on
        // this small trailing control while a full suite is running. Reuse
        // the semantic-then-stable-center helper and require the completed
        // state before continuing.
        tap(copyUsername, until: app.buttons["Copied"])
        XCTAssertEqual(qrIdentity.label, "@alexandria-community-builder")
        capture("profile-qr-code", app: app)

        app.buttons["profileQRCodeEditUsername"].tap()
        let accountSettingsBar = app.navigationBars["Account settings"]
        XCTAssertTrue(accountSettingsBar.waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["accountUsername"].value as? String, "alexandria-community-builder")
        capture("profile-qr-edit-username-native", app: app)
        tap(accountSettingsBar.buttons.firstMatch, until: qrNavigationBar)

        dismiss(app.buttons["Done"], until: app.navigationBars["My QR Code"])
        // Compact simulators can retain the dismissed sheet's navigation bar
        // in XCUI's cached hierarchy. The underlying balance becoming
        // hittable is the stronger proof that dismissal actually completed.
        XCTAssertTrue(balance.waitUntilHittable(timeout: 10))
        tap(balance, until: app.staticTexts["Current Balance"])
        capture("profile-balance-native-wallet", app: app)
    }

    @MainActor
    func testProfileNameMenuSwitchesConnectedAccountsLikeMobileWeb() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profileAccountSwitcher"
        app.launch()

        var accountMenu = app.buttons["profileIdentityCard"].firstMatch
        XCTAssertTrue(accountMenu.waitForExistence(timeout: 10))
        XCTAssertEqual(accountMenu.label, "Switch account, Alexandria")
        XCTAssertTrue(app.buttons["Open wallet, balance 27.9k sats"].exists)
        tap(accountMenu, until: app.buttons["Alexandria (You)"])

        XCTAssertTrue(app.buttons["Alexandria (You)"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Marlowe"].exists)
        XCTAssertTrue(app.buttons["Brynn"].exists)
        capture("profile-account-menu-main", app: app)

        selectProfileAccount(
            named: "Marlowe",
            in: app,
            until: app.buttons["Open wallet, balance 60.6k sats"])
        accountMenu = app.buttons["profileIdentityCard"].firstMatch
        XCTAssertTrue(accountMenu.waitForExistence(timeout: 3))
        XCTAssertEqual(accountMenu.label, "Switch account, Marlowe")
        XCTAssertTrue(app.buttons["Open wallet, balance 60.6k sats"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["@marlowe"].exists)
        capture("profile-account-menu-child", app: app)

        tap(accountMenu, until: app.buttons["Alexandria (You)"])
        selectProfileAccount(
            named: "Alexandria (You)",
            in: app,
            until: app.buttons["Open wallet, balance 27.9k sats"])
        accountMenu = app.buttons["profileIdentityCard"].firstMatch
        XCTAssertTrue(accountMenu.waitForExistence(timeout: 3))
        XCTAssertEqual(accountMenu.label, "Switch account, Alexandria")
        XCTAssertTrue(app.buttons["Open wallet, balance 27.9k sats"].waitForExistence(timeout: 3))

        // Switching is local session selection only. The fixture never calls
        // a relationship, profile, wallet, or production mutation endpoint.
        XCTAssertFalse(app.buttons["Charlotte"].exists)
    }

    @MainActor
    func testProfileAvatarOpensNativePictureEditor() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profile"
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["profileIdentityCard"].waitForExistence(timeout: 10))
        let avatar = app.buttons["Edit profile picture"]
        XCTAssertTrue(avatar.exists)
        XCTAssertTrue(avatar.waitUntilHittable(timeout: 5))
        capture("profile-avatar-edit-entry", app: app)

        tap(avatar, until: app.navigationBars["Account settings"])
        XCTAssertEqual(app.textFields["accountName"].value as? String, "Alexandria Montgomery")
        XCTAssertEqual(app.textFields["accountUsername"].value as? String, "alexandria-community-builder")
        XCTAssertTrue(app.buttons["Photo Library"].exists)
        XCTAssertFalse(app.buttons["accountSaveChanges"].exists)
        capture("profile-avatar-native-editor", app: app)
    }

    @MainActor
    func testProfileLogoutConfirmationCanBeCancelledSafely() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profile"
        app.launch()

        let identity = app.descendants(matching: .any)["profileIdentityCard"]
        XCTAssertTrue(identity.waitForExistence(timeout: 10))

        let logout = app.buttons["Log out"].firstMatch
        for _ in 0..<3 where !logout.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(logout.waitUntilHittable(timeout: 5))
        let title = app.staticTexts["Log out of Ganamos?"]
        // Compact iOS 17 can acknowledge the semantic tap after the scroll
        // without presenting the confirmation dialog. Reuse the stable-center
        // retry used by the other Profile transitions before asserting copy.
        tap(logout, until: title)
        XCTAssertTrue(app.staticTexts["You’ll need to sign in again to access your profile and wallet."].exists)
        capture("profile-logout-confirmation", app: app)

        let cancel = app.buttons["Cancel"]
        if cancel.exists {
            cancel.tap()
        } else {
            // iOS 26 presents this confirmation as a dismissible popover and
            // omits the explicit cancel action. Tapping the scrim is the native
            // cancellation path and must leave the authenticated Profile intact.
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap()
        }
        XCTAssertTrue(title.waitForNonExistence(timeout: 5))
        XCTAssertTrue(identity.waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Sign up to access your profile"].exists)
    }

    @MainActor
    func testProfileAdaptsAtAccessibilityTextSize() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profile"
        app.launchEnvironment["GANAMOS_PREVIEW_DYNAMIC_TYPE"] = "accessibility3"
        app.launch()

        XCTAssertTrue(app.staticTexts["Account settings"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.descendants(matching: .any)["profileIdentityCardAccessibility"].exists)
        XCTAssertTrue(app.staticTexts["Alexandria"].exists)
        XCTAssertTrue(app.buttons["Open pup settings"].exists)
        XCTAssertTrue(app.staticTexts["Marlowe"].exists)
        capture("profile-accessibility-xxx-large", app: app)
    }

    @MainActor
    func testProfileQRCodeAdaptsAtAccessibilityTextSize() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profile"
        app.launchEnvironment["GANAMOS_PREVIEW_DYNAMIC_TYPE"] = "accessibility3"
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["profileIdentityCardAccessibility"].waitForExistence(timeout: 10))
        tap(app.buttons["My QR code"], until: app.navigationBars["My QR Code"])

        let navigationBar = app.navigationBars["My QR Code"]
        let name = app.staticTexts["profileQRCodeName"]
        let identity = app.staticTexts["profileQRCodeIdentity"]
        let copy = app.buttons["Copy username"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        XCTAssertTrue(identity.exists)
        XCTAssertTrue(copy.exists)
        XCTAssertGreaterThanOrEqual(
            name.frame.minY,
            navigationBar.frame.maxY,
            "Accessibility QR identity must remain below the native navigation title")
        XCTAssertLessThanOrEqual(
            copy.frame.maxY,
            app.frame.maxY,
            "Accessibility QR copy action must remain inside the compact viewport")
        XCTAssertTrue(copy.isHittable)
        capture("profile-qr-accessibility-xxx-large", app: app)
    }

    @MainActor
    func testProfileEmptyRelationshipsMatchMobileWebFallbacks() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profileEmptyRelationships"
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["profileIdentityCard"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.descendants(matching: .any)["profileFamilyCard"].exists)
        XCTAssertEqual(app.staticTexts["profileUsdBalance"].label, "$22")
        let connectPet = app.buttons["Connect Pet"]
        XCTAssertTrue(connectPet.exists)
        XCTAssertEqual(connectPet.value as? String, "/connect-pet")
        XCTAssertTrue(app.images["profilePetIcon-cat.fill"].exists)
        XCTAssertTrue(app.staticTexts["Connect Pet"].exists)
        XCTAssertFalse(app.buttons["Open pup settings"].exists)
        XCTAssertFalse(app.staticTexts["pup"].exists)
        let addFamilyMember = app.descendants(matching: .any)["profileAddFamilyMember"]
        XCTAssertTrue(addFamilyMember.exists)
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Send sats to '")).firstMatch.exists)
        capture("profile-empty-relationships-web-parity", app: app)

        let refreshedAddFamilyMember = app.descendants(matching: .any)["profileAddFamilyMember"]
        XCTAssertTrue(refreshedAddFamilyMember.waitUntilHittable(timeout: 5))
        tap(refreshedAddFamilyMember, until: app.navigationBars["Family accounts"])
        XCTAssertTrue(app.staticTexts["Shared family access"].exists)
        // A serial iOS 26 suite can leave the fixture request behind the
        // simulator's preceding view-service teardown. Keep this assertion
        // bounded, but allow the same margin used by other async destinations.
        XCTAssertTrue(app.staticTexts["No family accounts"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["Add family member"].exists)
        capture("profile-empty-family-native-destination", app: app)
    }

    @MainActor
    func testProfilePetActionsOpenMobileWebRoutes() throws {
        var app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profile"
        app.launch()

        let connectedPet = app.buttons["Open pup settings"]
        XCTAssertTrue(connectedPet.waitForExistence(timeout: 10))
        XCTAssertEqual(connectedPet.value as? String, "/pet-settings")
        connectedPet.tap()
        XCTAssertTrue(app.buttons["Close"].waitForExistence(timeout: 10))
        capture("profile-connected-pet-settings-handoff", app: app)

        // SFSafariViewController dismissal is an iOS 26 automation boundary:
        // its Close control can remain in the XCUI hierarchy after a successful
        // synthesized tap. Relaunch to verify the second route independently.
        app.terminate()
        app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profileEmptyRelationships"
        app.launch()

        let connectPet = app.buttons["Connect Pet"]
        XCTAssertTrue(connectPet.waitForExistence(timeout: 10))
        XCTAssertEqual(connectPet.value as? String, "/connect-pet")
        connectPet.tap()
        XCTAssertTrue(app.buttons["Close"].waitForExistence(timeout: 10))
        capture("profile-empty-pet-connect-handoff", app: app)
    }

    @MainActor
    func testProfileSquirrelPetUsesMobileWebSpeciesIcon() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profileSquirrelPet"
        app.launch()

        XCTAssertTrue(app.buttons["Open Hazel settings"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.images["profilePetIcon-LucideSquirrel"].exists)
        XCTAssertFalse(app.images["profilePetIcon-cat.fill"].exists)
        capture("profile-squirrel-pet-icon-parity", app: app)
    }

    @MainActor
    func testProfileUnnamedConnectedPetKeepsMobileWebConnectedState() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profileUnnamedPet"
        app.launch()

        let pet = app.buttons["Open Pet settings"]
        XCTAssertTrue(pet.waitForExistence(timeout: 10))
        XCTAssertEqual(pet.value as? String, "/pet-settings")
        XCTAssertTrue(app.images["profilePetIcon-cat.fill"].exists)
        XCTAssertTrue(app.staticTexts["Pet"].exists)
        XCTAssertFalse(app.buttons["Connect Pet"].exists)
        capture("profile-unnamed-connected-pet-parity", app: app)
    }

    @MainActor
    func testProfileUnnamedFamilyMemberUsesMobileWebChildFallback() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profileUnnamedFamilyMember"
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["profileIdentityCard"].waitForExistence(timeout: 10))
        let child = app.buttons["Send sats to Child"]
        XCTAssertTrue(child.exists)
        XCTAssertTrue(app.staticTexts["Child"].exists)
        XCTAssertFalse(app.staticTexts["orion"].exists)
        XCTAssertTrue(app.staticTexts["4k"].exists)
        capture("profile-unnamed-family-child-parity", app: app)

        tap(child, until: app.navigationBars["Send"])
        let recipient = app.textFields["walletSendRecipient"]
        XCTAssertTrue(recipient.waitForExistence(timeout: 5))
        XCTAssertEqual(recipient.value as? String, "orion")
        XCTAssertFalse(app.buttons["walletReviewPayment"].isEnabled)
        capture("profile-unnamed-family-native-send", app: app)
    }

    @MainActor
    func testProfileQRCodeFallsBackToAccountIDWithoutUsername() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profileWithoutUsername"
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["profileIdentityCard"].waitForExistence(timeout: 10))
        // The deterministic profile carries an empty string rather than nil;
        // both states must preserve the mobile-web fallback.
        XCTAssertFalse(app.staticTexts["@alexandria-community-builder"].exists)
        XCTAssertTrue(app.staticTexts["@username"].exists)
        capture("profile-username-placeholder-parity", app: app)

        tap(app.buttons["My QR code"], until: app.navigationBars["My QR Code"])
        let identity = app.staticTexts["profileQRCodeIdentity"]
        XCTAssertTrue(identity.waitForExistence(timeout: 5))
        XCTAssertEqual(identity.label, "00000000-0000-0000-0000-000000000101")

        let copy = app.buttons["Copy account ID"]
        XCTAssertTrue(copy.exists)
        // Keep the fallback path as resilient as the primary username-copy
        // path on compact iOS 17, where the first synthesized tap on this
        // trailing control can be dropped during a serial suite run.
        tap(copy, until: app.buttons["Copied"])
        capture("profile-qr-account-id-fallback", app: app)
    }

    @MainActor
    func testProfileQRCodeUsesMobileWebNameFallback() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profileWithoutName"
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["profileIdentityCard"].waitForExistence(timeout: 10))
        tap(app.buttons["My QR code"], until: app.navigationBars["My QR Code"])

        let qrName = app.staticTexts["profileQRCodeName"]
        XCTAssertTrue(qrName.waitForExistence(timeout: 5))
        XCTAssertEqual(qrName.label, "User")
        XCTAssertEqual(
            app.staticTexts["profileQRCodeIdentity"].label,
            "@alexandria-community-builder")
        capture("profile-qr-name-fallback-parity", app: app)
    }

    @MainActor
    func testProfileShowsConfiguredAdminDestination() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "profileAdmin"
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["profileIdentityCard"].waitForExistence(timeout: 10))
        // SwiftUI exposes this NavigationLink as both a button and its visible
        // label. On iOS 26 the synthesized button frame can collapse to the
        // label height after scrolling, so target the same stable text element
        // used by the authenticated Profile destination coverage.
        let admin = app.staticTexts["Admin"]
        for _ in 0..<3 where !admin.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(admin.waitUntilHittable(timeout: 5))
        admin.tap()
        if !app.navigationBars["Admin"].waitForExistence(timeout: 2) {
            admin.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(app.navigationBars["Admin"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Dashboard"].exists)
        XCTAssertTrue(app.staticTexts["Pet Orders"].exists)
        XCTAssertTrue(app.staticTexts["47"].exists)
        XCTAssertTrue(app.staticTexts["Users"].exists)
        XCTAssertTrue(app.staticTexts["1,248"].exists)
        XCTAssertTrue(app.staticTexts["Posts"].exists)
        XCTAssertTrue(app.staticTexts["3,906"].exists)
        XCTAssertTrue(app.staticTexts["Transactions"].exists)
        XCTAssertTrue(app.staticTexts["18,221"].exists)
        XCTAssertTrue(app.buttons["Open full admin tools"].exists)
        capture("profile-admin-mobile-web-parity", app: app)
    }

    @MainActor
    func testAccountSettingsValidationWithoutSaving() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "accountSettings"
        app.launch()

        XCTAssertTrue(app.navigationBars["Account settings"].waitForExistence(timeout: 10))
        let name = app.textFields["accountName"]
        let username = app.textFields["accountUsername"]
        XCTAssertTrue(name.exists)
        XCTAssertTrue(username.exists)
        XCTAssertEqual(name.value as? String, "Alexandria Montgomery")
        XCTAssertEqual(username.value as? String, "alexandria-community-builder")
        XCTAssertFalse(app.buttons["accountSaveChanges"].exists)

        username.tap()
        username.typeText("-qa")
        let save = app.buttons["accountSaveChanges"]
        XCTAssertTrue(save.waitForExistence(timeout: 3))
        XCTAssertTrue(save.isEnabled)
        username.typeText("A")
        XCTAssertFalse(app.buttons["accountSaveChanges"].isEnabled)

        app.segmentedControls.buttons["Reward"].tap()
        XCTAssertTrue(app.segmentedControls.buttons["Reward"].isSelected)
        capture("account-settings-validated-no-save", app: app)
        // Do not select Save Changes. This verifies local validation and
        // preferences without issuing an authenticated profile mutation.
    }

    @MainActor
    func testFamilyAccountsAndPetHubNavigationWithoutOpeningProtectedFlows() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "familyAccounts"
        app.launch()

        XCTAssertTrue(app.navigationBars["Family accounts"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Add family member"].exists)
        XCTAssertTrue(app.staticTexts["Marlowe"].exists)
        XCTAssertTrue(app.staticTexts["@marlowe"].exists)
        XCTAssertTrue(app.staticTexts["Charlotte"].exists)
        capture("family-accounts-populated", app: app)

        tap(
            app.buttons["familyAccount-quickContact-00000000-0000-0000-0000-000000000201"],
            until: app.navigationBars["Marlowe"])
        XCTAssertTrue(app.staticTexts["@marlowe"].exists)
        XCTAssertTrue(app.buttons["Send sats"].exists)
        XCTAssertTrue(app.buttons["familyRemove-quickContact"].exists)
        XCTAssertTrue(app.staticTexts["Removing a family contact does not delete their Ganamos account."].exists)
        capture("family-account-detail", app: app)
        // Do not select Add family member, Send sats, or Remove from family.
        // This test verifies the populated hierarchy without mutating state.

        app.terminate()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "petHub"
        app.launch()
        XCTAssertTrue(app.navigationBars["Satoshi pet"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Your Bitcoin companion"].exists)
        XCTAssertTrue(app.buttons["Open pet, See mood, coins, and progress"].exists)
        XCTAssertTrue(app.buttons["Connect a pet, Pair a new Ganamos device"].exists)
        XCTAssertTrue(app.buttons["Pet store, Spend coins on accessories"].exists)
        XCTAssertTrue(app.buttons["Pet settings, Device name and preferences"].exists)
        capture("satoshi-pet-hub", app: app)
        // Do not open a pet destination; device and store subflows remain
        // authenticated protected web handoffs.
    }

    @MainActor
    func testFamilyMemberSendPrefillsRecipientWithoutReviewingPayment() throws {
        var app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "familyAccountsRemoval"
        app.launch()

        XCTAssertTrue(app.navigationBars["Family accounts"].waitForExistence(timeout: 10))
        tap(
            app.buttons["familyAccount-child-00000000-0000-0000-0000-000000000201"],
            until: app.navigationBars["Marlowe"])
        tap(app.buttons["Send sats"], until: app.navigationBars["Send"])

        let childRecipient = app.textFields["walletSendRecipient"]
        XCTAssertTrue(childRecipient.waitForExistence(timeout: 5))
        XCTAssertEqual(childRecipient.value as? String, "marlowe")
        XCTAssertFalse(app.buttons["walletReviewPayment"].isEnabled)
        capture("family-child-send-prefilled", app: app)

        // Relaunch for the quick-contact path so both relationship kinds are
        // verified independently without entering an amount or reviewing a payment.
        app.terminate()
        app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "familyAccountsRemoval"
        app.launch()
        XCTAssertTrue(app.navigationBars["Family accounts"].waitForExistence(timeout: 10))
        tap(
            app.buttons["familyAccount-quickContact-00000000-0000-0000-0000-000000000202"],
            until: app.navigationBars["Charlotte"])
        tap(app.buttons["Send sats"], until: app.navigationBars["Send"])

        let contactRecipient = app.textFields["walletSendRecipient"]
        XCTAssertTrue(contactRecipient.waitForExistence(timeout: 5))
        XCTAssertEqual(contactRecipient.value as? String, "charlotte")
        XCTAssertFalse(app.buttons["walletReviewPayment"].isEnabled)
        capture("family-contact-send-prefilled", app: app)
        // Do not enter an amount or select Review payment. No wallet request is issued.
    }

    @MainActor
    func testFamilyRemovalDistinguishesChildAccountsFromQuickContacts() throws {
        var app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "familyAccountsRemoval"
        app.launch()

        XCTAssertTrue(app.navigationBars["Family accounts"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Child account"].exists)
        XCTAssertTrue(app.staticTexts["@charlotte"].exists)
        capture("family-account-kinds", app: app)

        tap(
            app.buttons["familyAccount-child-00000000-0000-0000-0000-000000000201"],
            until: app.navigationBars["Marlowe"])
        let deleteChild = app.buttons["familyRemove-child"]
        XCTAssertTrue(deleteChild.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Deleting a child account deactivates it. Historical activity and transactions remain available."].exists)
        deleteChild.tap()
        XCTAssertTrue(app.staticTexts["This child account will be deactivated and disconnected from your profile. Historical activity and transactions are preserved."].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Delete child account"].exists)
        capture("family-child-delete-confirmation", app: app)

        // Relaunch so each destructive confirmation is verified from a clean,
        // deterministic state without invoking either removal handler.
        app.terminate()
        app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "familyAccountsRemoval"
        app.launch()
        tap(
            app.buttons["familyAccount-quickContact-00000000-0000-0000-0000-000000000202"],
            until: app.navigationBars["Charlotte"])
        let removeContact = app.buttons["familyRemove-quickContact"]
        XCTAssertTrue(removeContact.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Removing a family contact does not delete their Ganamos account."].exists)
        tap(removeContact, until: app.staticTexts["Remove Charlotte?"])
        XCTAssertTrue(app.staticTexts["This person will be removed from your family contacts. Their Ganamos account will not be changed."].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Remove from family"].exists)
        capture("family-contact-remove-confirmation", app: app)
    }

    @MainActor
    func testFamilyRemovalConfirmationsCanBeCancelledSafely() throws {
        var app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "familyAccountsRemoval"
        app.launch()

        XCTAssertTrue(app.navigationBars["Family accounts"].waitForExistence(timeout: 10))
        tap(
            app.buttons["familyAccount-child-00000000-0000-0000-0000-000000000201"],
            until: app.navigationBars["Marlowe"])
        let deleteChild = app.buttons["familyRemove-child"]
        XCTAssertTrue(deleteChild.waitForExistence(timeout: 5))
        tap(deleteChild, until: app.staticTexts["Delete Marlowe?"])
        dismissConfirmation(in: app, title: "Delete Marlowe?")
        XCTAssertTrue(app.navigationBars["Marlowe"].waitForExistence(timeout: 5))
        XCTAssertTrue(deleteChild.waitUntilHittable(timeout: 5))
        capture("family-child-delete-cancelled", app: app)

        // Relaunch for the quick-contact path so both relationship kinds are
        // verified independently and neither removal handler can run.
        app.terminate()
        app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "familyAccountsRemoval"
        app.launch()
        XCTAssertTrue(app.navigationBars["Family accounts"].waitForExistence(timeout: 10))
        tap(
            app.buttons["familyAccount-quickContact-00000000-0000-0000-0000-000000000202"],
            until: app.navigationBars["Charlotte"])
        let removeContact = app.buttons["familyRemove-quickContact"]
        XCTAssertTrue(removeContact.waitForExistence(timeout: 5))
        tap(removeContact, until: app.staticTexts["Remove Charlotte?"])
        dismissConfirmation(in: app, title: "Remove Charlotte?")
        XCTAssertTrue(app.navigationBars["Charlotte"].waitForExistence(timeout: 5))
        XCTAssertTrue(removeContact.waitUntilHittable(timeout: 5))
        capture("family-contact-remove-cancelled", app: app)
    }

    @MainActor
    func testFamilyRemovalAdaptsAtAccessibilityTextSize() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "familyAccountsRemoval"
        app.launchEnvironment["GANAMOS_PREVIEW_DYNAMIC_TYPE"] = "accessibility3"
        app.launch()

        XCTAssertTrue(app.navigationBars["Family accounts"].waitForExistence(timeout: 10))
        let child = app.buttons["familyAccount-child-00000000-0000-0000-0000-000000000201"]
        tap(child, until: app.navigationBars["Marlowe"])

        let deleteChild = app.buttons["familyRemove-child"]
        XCTAssertTrue(deleteChild.waitForExistence(timeout: 5))
        XCTAssertTrue(deleteChild.isHittable)
        XCTAssertGreaterThan(
            deleteChild.frame.height,
            48,
            "The destructive action must grow instead of truncating at accessibility text sizes")
        XCTAssertLessThanOrEqual(
            deleteChild.frame.maxY,
            app.frame.maxY,
            "The destructive family action must remain reachable at accessibility text sizes")
        XCTAssertTrue(app.staticTexts["Deleting a child account deactivates it. Historical activity and transactions remain available."].exists)
        capture("family-child-detail-accessibility-xxx-large", app: app)

        let confirmation = app.staticTexts["This child account will be deactivated and disconnected from your profile. Historical activity and transactions are preserved."]
        tap(deleteChild, until: confirmation)
        XCTAssertTrue(app.buttons["Delete child account"].exists)
        capture("family-child-delete-confirmation-accessibility-xxx-large", app: app)
        // Do not confirm deletion. This verifies the large-text native flow
        // without mutating a child account or family relationship.
    }

    @MainActor
    func testUnnamedChildAccountUsesSafeFamilyFallbacks() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "familyAccountsUnnamed"
        app.launch()

        XCTAssertTrue(app.navigationBars["Family accounts"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Child"].exists)
        XCTAssertTrue(app.staticTexts["Child account"].exists)
        XCTAssertFalse(app.staticTexts["orion"].exists)
        capture("family-unnamed-child-list", app: app)

        tap(
            app.buttons["familyAccount-child-00000000-0000-0000-0000-000000000206"],
            until: app.navigationBars["Child"])
        XCTAssertTrue(app.staticTexts["@orion"].exists)
        XCTAssertTrue(app.buttons["Send sats"].exists)

        let deleteChild = app.buttons["familyRemove-child"]
        XCTAssertTrue(deleteChild.waitForExistence(timeout: 5))
        tap(deleteChild, until: app.staticTexts["Delete this child account?"])
        XCTAssertTrue(app.buttons["Delete child account"].exists)
        capture("family-unnamed-child-delete-confirmation", app: app)
        // Do not confirm deletion. This verifies safe fallback copy without
        // mutating the child account or family relationship.
    }

    @MainActor
    func testProfileDestinationListsAndPostFiltering() throws {
        let app = XCUIApplication()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "groups"
        app.launch()
        XCTAssertTrue(app.navigationBars["Groups"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Find a group..."].exists)
        XCTAssertTrue(app.buttons["Create Group"].exists)
        XCTAssertTrue(app.staticTexts["Lake Merritt Neighbors"].exists)
        XCTAssertTrue(app.staticTexts["Local cleanups and community fixes"].exists)
        capture("groups-populated", app: app)

        openRegressionGroup(in: app)
        XCTAssertTrue(app.staticTexts["Join requests"].exists)
        XCTAssertTrue(app.staticTexts["Jordan Lee"].exists)
        XCTAssertTrue(app.buttons["Reject"].exists)
        XCTAssertTrue(app.buttons["Approve"].exists)
        XCTAssertTrue(app.staticTexts["Sam Rivera"].exists)
        XCTAssertTrue(app.buttons["Invite"].exists)

        let manageMember = app.buttons["Manage Sam Rivera"]
        let makeAdmin = app.buttons["Make admin"]
        manageMember.tap()
        if !makeAdmin.waitForExistence(timeout: 2) {
            // Menus can lose a semantic tap during a busy iOS 26 run even
            // though the source button remains hittable.
            manageMember.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(makeAdmin.waitForExistence(timeout: 3))
        let removeMember = app.buttons["Remove member"]
        XCTAssertTrue(removeMember.exists)
        removeMember.tap()
        if !app.staticTexts["Remove this member?"].waitForExistence(timeout: 2) {
            removeMember.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(app.staticTexts["Remove this member?"].waitForExistence(timeout: 3))

        // Terminating from the confirmation state proves the destructive
        // handler was not invoked and avoids an iOS 26 XCUI type mismatch
        // that reports the visible Cancel action as a PopUpButton.
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["Lake Merritt Neighbors"].waitForExistence(timeout: 10))
        openRegressionGroup(in: app)

        app.buttons["Delete group"].tap()
        XCTAssertTrue(app.staticTexts["Permanently delete Lake Merritt Neighbors?"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Members will be removed and group posts will become public. This cannot be undone."].exists)
        capture("group-admin-detail", app: app)

        app.terminate()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "activity"
        app.launch()
        XCTAssertTrue(app.navigationBars["Activity"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Issue fixed"].exists)
        XCTAssertTrue(app.staticTexts["Creek trail cleared"].exists)
        XCTAssertTrue(app.staticTexts["Deposited Bitcoin"].exists)
        XCTAssertTrue(app.staticTexts["Lightning deposit"].exists)
        capture("activity-mixed-timeline", app: app)

        let activityPost = app.descendants(matching: .any)[
            "activityPost-00000000-0000-0000-0000-000000000503"
        ]
        XCTAssertTrue(activityPost.waitForExistence(timeout: 3))
        activityPost.tap()
        if !app.staticTexts["Restore the creek trail"].waitForExistence(timeout: 2) {
            activityPost.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(app.staticTexts["Restore the creek trail"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Fixed"].exists)
        XCTAssertTrue(app.staticTexts["Clear storm debris and reopen the full trail."].exists)
        XCTAssertTrue(app.staticTexts["Creek trail"].exists)
        capture("activity-issue-deep-link", app: app)

        app.terminate()
        app.launchEnvironment["GANAMOS_PREVIEW_SCREEN"] = "userPosts"
        app.launch()
        XCTAssertTrue(app.navigationBars["Your Posts"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Clear the creek trail"].exists)
        XCTAssertTrue(app.staticTexts["Repair the garden gate"].exists)
        let postsFilter = app.segmentedControls.firstMatch
        let fixedFilter = postsFilter.buttons["Fixed"]
        fixedFilter.tap()
        if !app.staticTexts["Clear the creek trail"].waitForNonExistence(timeout: 2) {
            // iOS 26 can acknowledge the segmented button lookup without
            // delivering the tap while the simulator is busy. Retarget the
            // center of the third segment to make the state transition explicit.
            postsFilter.coordinate(withNormalizedOffset: CGVector(dx: 5.0 / 6.0, dy: 0.5)).tap()
        }
        XCTAssertTrue(app.staticTexts["Repair the garden gate"].exists)
        XCTAssertTrue(app.staticTexts["Clear the creek trail"].waitForNonExistence(timeout: 3))
        capture("posts-fixed-filter", app: app)
    }

    private enum TabPosition: CGFloat {
        // Centers of the five equal-width native tab items. The iOS 26
        // floating glass selection shape makes edge-biased taps unreliable.
        case map = 0.30, new = 0.50, wallet = 0.70, profile = 0.90

        var title: String {
            switch self {
            case .map: "Map"
            case .new: "New"
            case .wallet: "Wallet"
            case .profile: "Profile"
            }
        }
    }

    @MainActor
    private func openRegressionGroup(in app: XCUIApplication) {
        let group = app.descendants(matching: .any)["group-00000000-0000-0000-0000-000000000401"]
        let detail = app.navigationBars["Lake Merritt Neighbors"]
        XCTAssertTrue(group.waitForExistence(timeout: 3))
        tap(group, until: detail)
    }

    @MainActor
    private func openProfileDestination(
        _ label: String,
        navigationTitle: String,
        in app: XCUIApplication
    ) {
        // "Posts" also appears in the metrics card. The destination list is
        // below the card, so its matching text is the final element.
        let matchingRows = app.staticTexts.matching(NSPredicate(format: "label == %@", label))
        let row = matchingRows.element(boundBy: max(matchingRows.count - 1, 0))
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.tap()
        if !app.navigationBars[navigationTitle].waitForExistence(timeout: 2) {
            row.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(app.navigationBars[navigationTitle].waitForExistence(timeout: 10))
    }

    @MainActor
    private func returnToProfile(from navigationTitle: String, in app: XCUIApplication) {
        let navigationBar = app.navigationBars[navigationTitle]
        let back = navigationBar.buttons.firstMatch
        let profileMarker = app.staticTexts["Account settings"].firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 3))
        back.tap()
        if !profileMarker.waitForExistence(timeout: 2) {
            // iOS 26 can acknowledge the semantic Back tap on glass chrome
            // without delivering the navigation action. Retry through the
            // element's stable center before falling back to screen geometry.
            back.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        if !profileMarker.waitForExistence(timeout: 2) {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.06, dy: 0.07)).tap()
        }
        XCTAssertTrue(profileMarker.waitForExistence(timeout: 5))
    }

    @MainActor
    private func tapTab(_ tab: TabPosition, in app: XCUIApplication) {
        // Native SwiftUI tabs can report an invalid XCUI hit frame on both the
        // classic and Liquid Glass tab bars even while the control is visible.
        // Prefer semantic button interaction, then fall back to the stable
        // center of the corresponding native tab item.
        if ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26 {
            app.coordinate(withNormalizedOffset: CGVector(dx: tab.rawValue, dy: 0.92)).tap()
            return
        }

        let button = app.tabBars.firstMatch.buttons[tab.title]
        let frame = button.frame
        if button.exists,
           !frame.isNull,
           !frame.isInfinite,
           frame.minX >= 0,
           frame.minY >= 0 {
            button.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        } else {
            app.coordinate(withNormalizedOffset: CGVector(dx: tab.rawValue, dy: 0.92)).tap()
        }
    }

    @MainActor
    private func capture(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    private func tap(_ button: XCUIElement, until destination: XCUIElement) {
        button.tap()
        // Compact and busy simulators can acknowledge a synthesized tap
        // without delivering the control action. Retarget the element center
        // twice before failing, while still bounding the total wait.
        for _ in 0..<2 where !destination.waitForExistence(timeout: 2) {
            button.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(destination.waitForExistence(timeout: 3))
    }

    @MainActor
    private func selectProfileAccount(
        named accountName: String,
        in app: XCUIApplication,
        until selectedState: XCUIElement
    ) {
        for _ in 0..<3 where !selectedState.waitForExistence(timeout: 2) {
            let choice = app.buttons[accountName]
            if !choice.exists {
                tap(app.buttons["profileIdentityCard"].firstMatch, until: choice)
            }
            choice.tap()
        }
        XCTAssertTrue(selectedState.waitForExistence(timeout: 3))
    }

    @MainActor
    private func dismiss(_ button: XCUIElement, until presentedElement: XCUIElement) {
        button.tap()
        if !presentedElement.waitForNonExistence(timeout: 2) {
            button.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(presentedElement.waitForNonExistence(timeout: 5))
    }

    @MainActor
    private func dismissConfirmation(in app: XCUIApplication, title: String) {
        let presentedTitle = app.staticTexts[title]
        let cancel = app.buttons["Cancel"]
        if cancel.exists {
            dismiss(cancel, until: presentedTitle)
        } else {
            // iOS 26 may render a confirmationDialog as a popover without an
            // explicit cancel button. Its system-native cancellation path is
            // the surrounding scrim. XCUI can retain the popover title as a
            // stale text proxy, so callers verify the restored underlying
            // control is hittable instead of keying off that stale label.
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap()
        }
    }

    @MainActor
    private func dismissKeyboard(in app: XCUIApplication) {
        let keyboard = app.keyboards.firstMatch
        let dismiss = app.buttons["Dismiss keyboard"]
        XCTAssertTrue(dismiss.waitForExistence(timeout: 5))
        dismiss.tap()
        XCTAssertTrue(
            keyboard.waitForNonExistence(timeout: 8),
            "Keyboard did not finish dismissing after the native toolbar action"
        )
    }

    @MainActor
    private func dismissPasswordSavePromptIfNeeded(in app: XCUIApplication, shouldExpectPrompt: Bool) {
        // Fresh simulator sign-ins can trigger the system Passwords save sheet.
        // It lives outside the app hierarchy and otherwise consumes subsequent tab taps.
        let appNotNow = app.buttons.matching(NSPredicate(format: "label == %@", "Not Now")).firstMatch
        if appNotNow.waitForExistence(timeout: 1) {
            appNotNow.tap()
            if !appNotNow.waitForNonExistence(timeout: 2) {
                // On a busy iOS 26 simulator the cross-process proxy can accept
                // a semantic tap without delivering it to the Passwords sheet.
                // Retry its stable center, then the known system-sheet location.
                appNotNow.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            }
            if !appNotNow.waitForNonExistence(timeout: 2), shouldExpectPrompt {
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.31, dy: 0.61)).tap()
            }
            XCTAssertTrue(appNotNow.waitForNonExistence(timeout: 5))
            return
        }
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let notNow = springboard.buttons.matching(NSPredicate(format: "label == %@", "Not Now")).firstMatch
        if notNow.waitForExistence(timeout: 2) {
            notNow.tap()
            if !notNow.waitForNonExistence(timeout: 2) {
                notNow.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            }
            XCTAssertTrue(notNow.waitForNonExistence(timeout: 5))
        } else if shouldExpectPrompt && ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26 {
            // The iOS 26 Passwords prompt is visible but missing from both the app
            // and SpringBoard XCUI hierarchies. Its stable system-sheet button location
            // is the only reliable dismissal path in a fresh simulator session.
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.31, dy: 0.61)).tap()
        }
    }

    private func regressionValue(_ key: String) -> String? {
        if let value = ProcessInfo.processInfo.environment[key], !value.isEmpty {
            return value
        }
        guard let value = Bundle(for: Self.self).object(forInfoDictionaryKey: key) as? String,
              !value.isEmpty else { return nil }
        return value
    }

}

private extension XCUIElement {
    func waitForValue(_ expectedValue: String, timeout: TimeInterval) -> Bool {
        let predicate = NSPredicate(format: "value == %@", expectedValue)
        return XCTWaiter.wait(
            for: [XCTNSPredicateExpectation(predicate: predicate, object: self)],
            timeout: timeout) == .completed
    }

    func waitUntilHittable(timeout: TimeInterval) -> Bool {
        let predicate = NSPredicate(format: "isHittable == true")
        return XCTWaiter.wait(
            for: [XCTNSPredicateExpectation(predicate: predicate, object: self)],
            timeout: timeout) == .completed
    }
}
