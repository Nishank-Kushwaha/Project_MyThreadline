import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";
import env from "./env.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: env.google.clientId,
      clientSecret: env.google.clientSecret,
      callbackURL: env.google.callbackUrl,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) {
          return done(new Error("Google account has no email"), null);
        }

        // Match by googleId first (returning user), then by email
        // (a manual account signing in with Google for the first time).
        let user = await User.findOne({
          $or: [{ googleId: profile.id }, { email }],
        });

        if (!user) {
          user = await User.create({
            name: profile.displayName,
            email,
            googleId: profile.id,
            avatarUrl: profile.photos?.[0]?.value || "",
          });
        } else if (!user.googleId) {
          // Link the Google identity to the existing manual account.
          user.googleId = profile.id;
          if (!user.avatarUrl && profile.photos?.[0]?.value) {
            user.avatarUrl = profile.photos[0].value;
          }
          await user.save();
        }

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    },
  ),
);

export default passport;
