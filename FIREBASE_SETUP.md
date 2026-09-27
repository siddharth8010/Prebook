# Pre Book Firebase access setup

The two existing name cards now sign in with Google. No visual layout changes are needed.

Before publishing the authentication branch:

1. In Firebase project `prebook-5b650`, enable the **Google** sign-in provider under Authentication → Sign-in method.
2. Add `prebook-lac.vercel.app` to Authentication → Settings → Authorized domains.
3. Deploy this branch to a preview URL and verify that Siddharth can use `siddharthsuresh57@gmail.com` and Diljith can use `diljith256@gmail.com`. A mismatched account must stay on the name picker.
4. Publish the authentication code, then immediately deploy `firestore.rules` to project `prebook-5b650`. The rules allow only those two verified Google accounts to read or write `data/bookings` and `data/settings`.
5. Recheck booking creation, refresh, partner visibility, gear changes, and sign-out in both accounts.

Do not deploy the rules before the authentication code is live: the existing anonymous client would lose access. Do not publish the authentication code before enabling Google sign-in and authorizing the Vercel domain.

The browser's Firebase configuration is public by design. Access control comes from Firebase Authentication and the deployed Firestore rules, not from hiding that configuration.
