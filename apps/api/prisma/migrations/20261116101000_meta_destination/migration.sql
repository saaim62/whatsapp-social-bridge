-- Explicit Meta publishing destination (P0-4).
--
-- Publishing previously auto-picked the first Facebook Page with a
-- linked Instagram account, which can post to the wrong shop for
-- users who manage several Pages. The reseller now picks a
-- destination in Settings; the chosen page/IG ids live on the
-- SocialAccount row (facebookPageId / instagramUserId already existed
-- but were never populated) and these two columns store the display
-- names shown in the picker and on the review page. Publishing is
-- blocked until a destination is saved.
ALTER TABLE "SocialAccount" ADD COLUMN "facebookPageName" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN "instagramUsername" TEXT;
