# Asking a camera operator for permission

Most public cameras have no published terms of use, so the registry lists
them as external links only. One email to the operator often changes that.
This page has a ready letter in Hebrew and English, and what to do with
the reply.

## Who to ask

Send the letter to the organisation that runs the camera, not to a site
that re-streams it. In Israel, for example:

- Netivei Israel (national roads company) and Ayalon Highways, for highway
  cameras
- Municipalities (Tel Aviv-Yafo, Jerusalem, Haifa and others), for city and
  beach cameras
- Port, marina and tourism authorities
- Operators of beach and surf webcams
- The Western Wall Heritage Foundation, for its Western Wall live view

Use the organisation's official contact address or form, ideally its
spokesperson or digital/open-data department.

## What the letter asks for

The letter asks for three separate permissions, so the operator can agree to
some and not others:

1. **Display**: show the camera's image or stream, with attribution and a
   link to the operator.
2. **AI analysis**: let an AI model describe traffic and weather in the
   image. Nothing is stored, and no people or plates are identified.
3. **Commercial use**: the software is open source, so others may run it
   for commercial purposes, for example a company's internal dashboard.

It also commits the project to:

- showing the operator's name, a link and any attribution text it asks for;
- never storing or archiving images (they are held in memory for at most a
  few minutes);
- fetching no more often than the camera updates;
- never using images for face recognition, licence-plate recognition or
  tracking people;
- removing the camera promptly if the operator asks.

## The letter (Hebrew)

> **נושא: בקשת אישור להצגת מצלמה ציבורית בפרויקט קוד פתוח AI Street Situation**
>
> שלום רב,
>
> אני כותב/ת בשם הפרויקט AI Street Situation, תוכנת קוד פתוח (רישיון MIT)
> שמציגה "תמונת מצב" לכל כתובת: תנועה, מזג אוויר, אירועים בדרך ומצלמות
> ציבוריות. הקוד זמין בכתובת https://github.com/yossi123654/ai-street-situation.
>
> נשמח לכלול את המצלמה/ות שלכם: **[שם המצלמה, מיקום וקישור לעמוד שלה]**.
> לא מצאנו באתר שלכם תנאי שימוש שמתייחסים לכך, ולכן אנחנו מבקשים את
> אישורכם. נשמח לתשובה לכל אחד מהסעיפים בנפרד:
>
> 1. **הצגה**: האם מותר להציג את התמונה או השידור באפליקציה, עם ציון שמכם
>    וקישור לאתר שלכם? (כן / לא)
> 2. **ניתוח בינה מלאכותית**: האם מותר שמודל AI יתאר את מצב התנועה ומזג
>    האוויר שנראים בתמונה? התמונה אינה נשמרת, ואין זיהוי של אנשים או של
>    לוחיות רישוי. (כן / לא)
> 3. **שימוש מסחרי**: מאחר שהתוכנה פתוחה, גופים אחרים עשויים להפעיל אותה גם
>    לצרכים מסחריים. האם האישור חל גם עליהם? (כן / לא)
>
> אנחנו מתחייבים:
>
> - להציג את שמכם, קישור לאתר שלכם וכל נוסח קרדיט שתבקשו;
> - לא לשמור ולא לארכב תמונות (הן נשמרות בזיכרון לכמה דקות לכל היותר);
> - לא למשוך תמונות בתדירות גבוהה מקצב העדכון של המצלמה;
> - לא להשתמש בתמונות לזיהוי פנים, לזיהוי לוחיות רישוי או למעקב אחר אנשים;
> - להסיר את המצלמה מיד אם תבקשו זאת.
>
> אם יש לכם תנאי שימוש כתובים, ממשק נתונים (API) או נוסח קרדיט מועדף, נשמח
> לקבל אותם. אפשר גם לענות בקצרה במייל הזה; התשובה תקושר מתוך הרישום של
> המצלמה במאגר הפתוח שלנו.
>
> תודה רבה,
> **[שם]**
> **[פרטי קשר]**

## The letter (English)

> **Subject: Permission request: showing your public camera in the open-source project AI Street Situation**
>
> Hello,
>
> I am writing on behalf of AI Street Situation, an open-source application
> (MIT licence) that shows a "situation picture" for any address: traffic,
> weather, road incidents and public cameras. The code is at
> https://github.com/yossi123654/ai-street-situation.
>
> We would like to include your camera(s): **[camera name, location and a
> link to its page]**. We could not find terms of use on your site that
> cover this, so we are asking for your permission. Please answer each point
> separately:
>
> 1. **Display**: may the app show the image or stream, credited to you with
>    a link to your site? (yes / no)
> 2. **AI analysis**: may an AI model describe the traffic and weather
>    visible in the image? The image is not stored, and no people or licence
>    plates are identified. (yes / no)
> 3. **Commercial use**: because the software is open source, others may run
>    it for commercial purposes. Does your permission extend to them?
>    (yes / no)
>
> We commit to:
>
> - showing your name, a link to your site and any credit text you ask for;
> - never storing or archiving images (they are held in memory for a few
>   minutes at most);
> - never fetching more often than the camera updates;
> - never using images for face recognition, licence-plate recognition or
>   tracking people;
> - removing the camera promptly if you ask.
>
> If you have written terms, a data feed (API) or a preferred credit line,
> we would be glad to receive them. A short reply to this email is also
> fine; it will be linked from the camera's entry in our open registry.
>
> Thank you,
> **[Name]**
> **[Contact details]**

## After the reply

1. Map each answer to the camera's permissions: yes → `true`, no → `false`,
   no answer → `"unknown"`.
2. If the operator published terms, put that URL in `license.termsUrl`. If
   the permission came by email, put the operator's page in `termsUrl`,
   summarise the reply (date, who answered, what was allowed) in `notes`,
   and mention it in your pull request so a maintainer can see the email.
   Do not commit personal email addresses.
3. Use the credit text the operator asked for in `license.attribution`.
4. If the operator offers a feed with many cameras, consider writing a
   camera provider instead of individual entries (see
   [adding-a-camera.md](adding-a-camera.md#adding-a-whole-source-many-cameras)).
5. Add the source to [sources.md](sources.md).
