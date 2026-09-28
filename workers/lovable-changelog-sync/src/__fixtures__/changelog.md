> ## Documentation Index
> Fetch the complete documentation index at: https://docs.lovable.dev/llms.txt
> Use this file to discover all available pages before exploring further.

# Lovable changelog

> Lovable changelog and product updates. Stay up to date with new features, improvements, and bug fixes shipped in Lovable.

<Update label="Sep 25, 2026">
  ### App + chat connectors: Discord and Google Business Profile

  [Discord](/integrations/discord) lets apps post messages to a Discord channel, list the servers a bot has joined, read recent channel history, and respond to slash commands. Use it for order and signup alerts in a channel, support handoffs from a contact form, and announcement boards.

  [Google Business Profile](/integrations/google-business-profile) lets apps read and update the business profiles you manage on Google Search and Maps, including opening hours, reviews and owner replies, local posts and photos, verification status, and performance metrics. Use it for review responses, opening hours updates, and dashboards that compare your locations.

  Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### GPT-6 Sol and GPT-6 Luna for your app's AI features

  Your app's [AI features](/features/ai#chat-models) can now use two new OpenAI models:

  * GPT-6 Sol
  * GPT-6 Luna

  Both accept text and image input and respond with text. Ask Lovable to use either model in your app, or describe what you want and let Lovable pick.

  ### Account settings have moved to their own dialog

  Your personal settings now open in an [**Account settings**](/introduction/lovable-account-settings) dialog from your avatar at the bottom left of the sidebar, or with **Cmd+.** (Mac) or **Ctrl+.** (Windows and Linux). In the dialog you find your profile and login methods, preferences, security, and the other ways to use Lovable, such as the desktop and mobile apps. Workspace settings such as members, billing, and security policies stay on the workspace settings page, which you open from the workspace switcher at the top left.

  ### Open cited web sources from an answer

  Each web source Lovable cites in an answer, in Chats and in the project chat, now appears as a small pill with the site's icon and domain. Hover over the pill to see the page title, a short excerpt, and the URL, or click it to open the source in a new tab.
</Update>

<Update label="Sep 24, 2026">
  ### Create, update, and publish Storyblok content from your app

  The [Storyblok connector](/integrations/storyblok) now offers a **Management API** option. Sign in with your Storyblok account when you add a connection, and your app can create, update, and publish stories, and manage assets and components, in the spaces you approve. You can also ask Lovable in the project chat to make those changes for you. The **CDN API** option remains available for read-only access to published or preview content.

  ### See which credit limit applies to each member in the People export

  Workspace admins and owners can now see the monthly credit limit in effect for each member when they [export the member list](/features/people#export-the-member-list) from **Settings → People**. Two new columns at the end of the CSV, **Effective Credit Limit** and **Credit Limit Source**, show the limit that applies and whether it is the member's personal limit, the workspace default, or not set. The **Credit Limit** column shows personal limits only.
</Update>

<Update label="Sep 23, 2026">
  ### Claude models for your app's AI features

  Your app's [AI features](/features/ai#chat-models) can now use Anthropic's Claude models, with no Anthropic account or API key. Ask Lovable to add Claude to any newer app (created from May 13, 2026, which uses TanStack Start) for chatbots, document and image analysis, field extraction from uploaded PDFs, and structured output. The available models are:

  * Claude Fable 5.1
  * Claude Opus 5.5
  * Claude Opus 5
  * Claude Sonnet 5
  * Claude Haiku 4.5

  ### App + chat connectors: AWS API, Azure Cloud API, Azure Graph & Entra API, Google Cloud API, and Looker

  Five new app + chat connectors let your apps work with your AWS, Azure, and Google Cloud accounts and with the metrics your team defines in Looker. The cloud connectors give your app access to those services and do not host or publish your Lovable app on them. Add them from **Connectors**, or ask Lovable in a project to connect one.

  * [AWS API](/integrations/aws) lets apps call any AWS service, such as EC2, DynamoDB, Lambda, SQS, and CloudWatch, to list resources, read metrics and logs, invoke functions, and manage resources in your account.
  * [Azure Cloud API](/integrations/azure) lets apps inventory and manage the resources in your Azure subscriptions, inspect role assignments, and build cost and activity dashboards.
  * [Azure Graph & Entra API](/integrations/azure-graph) lets apps read and administer your Microsoft Entra directory and Microsoft 365 data through Microsoft Graph, including users and groups, SharePoint sites, organization mailboxes, and app registrations.
  * [Google Cloud API](/integrations/gcp) lets apps call any Google Cloud REST API to list projects and resources, read Cloud Monitoring and Cloud Logging data, inspect IAM policies, and manage resources in your Google Cloud projects.
  * [Looker](/integrations/looker) lets apps run queries on the measures and dimensions your analytics team defines in LookML, so the numbers in your app match your Looker reports.

  ### Enable extended-retention models in your Enterprise workspace

  Workspace admins and owners on Enterprise plans can now enable [extended-retention models](/features/privacy-and-security-settings#extended-retention-models) under **Data protection** in the workspace's **Privacy & security** settings. Enterprise workspaces use only zero-data-retention models by default, which excludes some of the most capable models. When the setting is enabled, Lovable can use models whose provider retains prompts and outputs for at least 30 days before automatic deletion, both while building your projects and in the AI features of apps published from the workspace. Retained data is never used for AI model training. You confirm the terms when you enable the setting.

  ### See the estimated monthly Cloud cost of each database size

  Before you change your project's database size, the **Manage instance** dialog now shows an [estimated monthly Cloud cost](/features/advanced-settings#estimated-monthly-cloud-cost) in credits under each size. Lovable bases the estimate on your app's Cloud usage over the last 30 days, and uses a default usage estimate for apps without enough history.

  ### Image and video generation now appear in Usage details

  You can now see your spend on image generation and video generation as separate items in [Usage details](/introduction/credits-and-usage#reading-the-chart). Under **Workspace settings → Plans & credit usage → Usage details**, select **Build credits** to see **Image generation** and **Video generation** listed alongside **Build** and **Chat** in the chart and the table below it. Like other work Lovable does in your project, generated images and videos use build credits.

  ### Redesigned project Security view

  The project [Security view](/features/security-view) now explains what each finding means for your app and its users. Findings are grouped into security areas, such as **Access control & authorization** and **Leaked secrets & credentials**. Each finding opens with **What could happen**, a plain-language explanation of the risk, and **Technical details** with the evidence and the source location. Two cards at the top, **Deep security scan** and **Quick security scan**, show the state of each scan and let you run it. Both scans remain free.

  ### Redesigned Projects page

  The [Projects page](/introduction/project-search-and-find#project-list) has a new header and toolbar. The search field, **Filter**, and **View** are now below the page title, and **Filter** opens one searchable menu for all filters, with each one you apply shown as a chip you can remove. To see only your own projects or the ones shared with you, open the **Owner** filter and select yourself or **Shared with me**. Folder pages use the same layout.

  ### One project menu on your phone

  On your phone, the [**Project menu**](/integrations/lovable-mobile-app#editor-and-project-menu) now opens when you tap the project name in the editor and brings together sharing, publishing, and the project's tools and settings.

  ### Typo-tolerant connector search

  The [**Connectors** catalog](/integrations/introduction#where-to-find-connectors) now shows results for the closest match when you misspell a name in its search field, with **Showing results for** and the corrected name above them.
</Update>

<Update label="Sep 22, 2026">
  ### Connect your app to Parallel

  You can now connect your Lovable app to [Parallel](/integrations/parallel) to search the live web, read any public page or PDF as clean text, get cited answers to research questions, and run deep research tasks that fill structured data with sources. It fits lead enrichment, due diligence, market research, and chatbots grounded in current sources. With **Managed by Lovable**, you need no Parallel account, and Lovable charges each request to the workspace that owns the project, under Run credits. Add it from **Connectors**, or ask Lovable in a project to connect it.
</Update>

<Update label="Sep 21, 2026">
  ### Chat with Lovable across your workspace or inside a project

  You can now chat with Lovable to think, ask, and plan without changing any code. Chatting is free within a daily chat allowance on Free, Pro, and Business plans.

  * [**Chats**](/features/chats), outside your projects: private conversations where you think through an idea, ask about your apps and workspace, work in your connected tools, create files, and send work to a project when you are ready to build. Start one from the dashboard prompt box with **Chat** selected, or at [lovable.dev/chats](https://lovable.dev/chats). You can also select **Start voice conversation**, and Lovable listens and answers aloud.
  * [**Chat mode**](/features/chat-mode), inside a project: the **Chat** option in the project mode picker. Lovable discusses the app you have open without changing its code, and shows a **Start building** card when a change is needed.

  Each message is priced on the work Lovable does to answer it, typically a fraction of a credit, and the daily chat allowance covers it first. Work a chat sends to a project uses build credits.

  ### Jev for typed decisions in your app's AI features

  Your app's [AI features](/features/ai#typed-decision-models) can now use **Jev Latest**, a typed decision model from TypeSafe that returns a category, a score, or a yes/no probability instead of generated text. Ask Lovable to use it for ticket triage, content moderation, routing, or search ranking.

  ### Use your connected tools from Lovable in Telegram

  [Lovable in Telegram](/tips-tricks/lovable-telegram-bot) can now work in your connected tools, such as Slack, Notion, or HubSpot, under the same rules as Chats. Lovable reads from a connected tool without asking, and asks for your approval in the chat, with a **Permission needed** card, before it creates, sends, or changes anything through a tool.

  ### Set a default design system for each group

  Workspace admins and owners on Business and Enterprise plans can now set a [default design system for a group](/features/groups#set-a-default-design-system-for-a-group) from the group's detail page in **Workspace settings → Groups**. Members of the group get it pre-selected when they create a project, in place of the workspace default, so each team builds on its own components and styles. Members can change or remove the pre-selected design system before they create the project. A member of several groups with different defaults gets the workspace default.

  ### Manage agent permissions from your account settings

  You can now review and change every [agent permission](/introduction/lovable-account-settings#agent-permissions) from one page, **Account settings → Preferences → Agent permissions**. It lists what Lovable may do without asking you first, for each connector available in your workspace and for creating or editing projects from a chat. Each connector permission offers **Always allow**, **Ask each time**, or **Never allow**. The settings are saved to your account and apply in every workspace and project.
</Update>

<Update label="Sep 20, 2026">
  ### Organize project files into collections

  The project [**Files** tab](/features/generate-files) has a new layout. You can now group files into collections, where one file can belong to several collections at once, upload your own files or drag them onto the tab, and see new files appear as Lovable creates them. Ask Lovable to organize your files and it creates and updates collections for you, shows them in the project chat, and works with the collections you reference.
</Update>

<Update label="Sep 19, 2026">
  ### Cleaner transcripts when you dictate a prompt

  When you dictate a message with the microphone in the prompt box, Lovable now removes filler words and cleans up the text as it transcribes, and it recognizes product names.
</Update>

<Update label="Sep 18, 2026">
  ### Use Firecrawl without a Firecrawl account

  The [Firecrawl connector](/integrations/firecrawl) now offers a **Managed by Lovable** option: connect with no Firecrawl account or API key. Requests through the managed connection use Firecrawl credits, which Lovable charges to the workspace that owns the project, and the usage appears under Run credits.

  ### Try the Lovable API in Postman

  The [Lovable API collection](/integrations/lovable-api#try-the-api-in-postman) is now in the Postman API Network. Fork it into your own Postman workspace to browse every endpoint in the current API version, with saved example responses, and try requests with your API key. Creating API keys requires a Business or Enterprise plan.

  ### Type `@` or `/` to add context and skills where you type

  When you type `@` in the chat input, the list of projects, connectors, and designs you can add now opens at your cursor, and `/` opens the **Skills** list the same way. Keep typing to filter the list.

  ### Redesigned project cards

  Project cards on the [dashboard](/introduction/dashboard-overview#manage-projects-from-the-dashboard) have a cleaner layout that matches Lovable's current design. Click anywhere on a card to open the project. All actions, including copying the project link or the app link, are in the card's **⋯** menu, grouped under **Copy**, **Open**, **Move**, and **Edit**.
</Update>

<Update label="Sep 17, 2026">
  ### Automate your workspace with the Lovable API

  You can now use the [Lovable API](/api-reference/introduction) from your own scripts and services to list and update projects, publish and unpublish them, embed a project preview in your product, and read analytics and security scans for your workspace. Create an API key under **Access tokens** in your settings. Creating a key requires a Business or Enterprise plan and an owner or admin role.

  ### Connect your app to the Lovable API

  You can now connect your Lovable app to the [Lovable API](/integrations/lovable-api-connector) to list and manage projects, publish, embed project previews, and read analytics, members, and security insights for a connected Lovable workspace. It fits internal dashboards, client portals, and admin tools built on top of your workspace. The connector is available on Business and Enterprise plans. Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Perplexity web search without your own API key

  The [Perplexity connector](/integrations/perplexity#two-ways-to-connect) now offers a **Managed by Lovable** option for web search: connect with no Perplexity account or API key. Lovable charges each search to the workspace that owns the project, and the usage appears under Run credits. The managed option covers Perplexity's Search API. Cited answers, deep research, and academic or SEC search need your own Perplexity API key.
</Update>

<Update label="Sep 16, 2026">
  ### Updated Chat actions menu in projects

  The [Chat actions menu](/features/projects/chat#chat-actions), the **+** button next to the chat input in a project, now has one **Add context** group for everything you can add to a message: skills, other projects, connectors, designs, screenshots, and files. Typing `@` or `/` opens the same menu, at context or at skills, and on desktop a panel shows details for the skill, project, or connector you highlight. **Goal** is listed with the skills built by Lovable.
</Update>

<Update label="Sep 15, 2026">
  ### Connect your app to WhatsApp Business

  You can now connect your Lovable app to [WhatsApp Business](/integrations/whatsapp) to receive customer messages, reply from your business phone number, send notifications with approved message templates, and track whether messages are sent, delivered, or read. It fits customer support inboxes, appointment reminders, and order updates. Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Connect your app to Power BI

  You can now connect your Lovable app to [Power BI](/integrations/power-bi) to query the semantic models behind your Power BI reports with DAX and show the results in your app, reusing the measures your BI team already maintains so the app's numbers match your reports. It fits KPI dashboards, regional scorecards, and weekly metrics pages. The connector also supports [per-user access](/integrations/app-user-connectors), where each person who uses your published app signs in with their own Microsoft work account and sees only the rows Power BI lets them see. Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### GPT Image 2.5 Flare and Sunburst for your app's AI features

  Your app's [AI features](/features/ai) can now generate and edit images with two new OpenAI models. **GPT Image 2.5 Flare** (`openai/gpt-image-2.5-flare`) is the faster model, for previews and in-app image editors, and **GPT Image 2.5 Sunburst** (`openai/gpt-image-2.5-sunburst`) gives the highest quality, for final assets and detailed visuals. Both can produce images with a transparent background, as PNG or WebP files. Ask Lovable to use either model when it builds an image feature for your app. Generating and editing images uses credits, like other AI usage.

  ### Skipping Lovable's questions no longer approves additional work

  When Lovable shows a [question card](/features/projects/chat#answer-lovable’s-questions) and you select **Skip**, it now continues with reasonable defaults for the work you already asked for and no longer treats the skip as approval for additional work it suggested.

  ### Removed: workspace-level AI model training setting

  The **Use workspace content for model training** setting has been removed from workspace settings. Business and Enterprise workspace data is already [excluded from AI model training by default](/features/business/data-opt-out), so the setting was redundant. Nothing changes for your workspace.
</Update>

<Update label="Sep 11, 2026">
  ### Edit an SSO provider's connection settings

  Workspace admins and owners on Business and Enterprise plans can now edit the connection settings of an existing [SSO provider](/features/business/sso#manage-an-existing-sso-provider). Open the provider in your workspace's identity settings and use its **Connection** tab to change the SAML sign-on URL, the signing certificates, or the OIDC client secret.

  You can now add several signing certificates to a SAML provider. Lovable accepts sign-ins signed with any of them, so you can add your identity provider's new certificate before it takes effect and remove the old one afterwards.

  For an OIDC provider, you can now record when the client secret expires, and the **Connection** tab shows how long the secret remains valid.

  ### Lock workspace membership to your identity provider

  Workspace admins and owners on Enterprise plans that use SCIM can now [lock workspace membership to their identity provider](/features/business/scim#lock-membership-to-your-identity-provider). With **SCIM-managed invites and removal** enabled, nobody in the workspace, including admins and owners, can invite members, approve access requests, or remove members in Lovable. Changing member roles in Lovable is not affected.

  ### Require two-factor authentication for your workspace

  Workspace admins and owners on Enterprise plans can now [require two-factor authentication](/features/privacy-and-security-settings#require-two-factor-authentication) for everyone who accesses the workspace. Anyone who has not set up two-factor authentication is asked to do so the next time they use the workspace.

  ### Connect other MCP clients to the Lovable MCP server

  The [Lovable MCP server](/integrations/lovable-mcp-server) now works with any MCP client that runs on your computer and supports OAuth. Add `https://mcp.lovable.dev` as an MCP server in the client and sign in with your Lovable account to build and manage your Lovable apps from there.

  ### Clearer sharing settings for connections

  A connection's settings now have a **Sharing** section that shows [who can use the connection](/integrations/admin-controls#who-can-use-connections-and-clients), and a **Private** label marks connections that only you can use. In **Connectors**, private and shared connections appear in separate lists, and Lovable asks you to confirm before it shares one of your private connections with a project collaborator.

  ### Preview a remixable project without signing in

  Anyone who opens the link to a project with [public remixing](/features/projects/remix) enabled can now see a preview of the latest version of the app before they remix it, even without a Lovable account. The page shows a **Remix** button, and remixing requires signing in. It shows the app only, with no project name, code, chat history, or files.

  ### Preview or remix a template from its card

  You can now [preview or remix a template](/features/projects/remix#how-to-remix) from its card. On `lovable.dev/templates` and on the dashboard's **Lovable templates** tab, each template card has a **⋯** menu with **Preview** and **Remix**. **Preview** opens the template app in a preview window, and **Remix** makes your own copy of the template.

  ### Get a warning when another Lovable project already uses your Supabase project

  When you [connect your own Supabase project](/integrations/supabase#connect-your-lovable-project-to-a-supabase-project), Lovable now warns you if another Lovable project already uses it. Projects that share one Supabase project overwrite each other's secrets and can break each other's integrations. The warning appears next to the project when you pick it and does not block you from connecting.

  ### Preview PDF attachments in chat

  PDF files you [attach in chat as context](/features/projects/chat#attach-files-as-context) now open in a readable preview on desktop. On a phone or tablet, the preview shows **Open PDF**, which opens the file in your browser.
</Update>

<Update label="Sep 10, 2026">
  ### Sync your project with Bitbucket Cloud

  You can now [sync your Lovable project with Bitbucket Cloud](/integrations/bitbucket). Connect a Bitbucket workspace from your project's Git settings, and Lovable creates a private repository and keeps it in sync both ways: edits in Lovable push to Bitbucket, and pushes to Bitbucket pull into Lovable. Workspace admins and owners add the connection.

  ### Connect your app to Cloudflare API

  You can now connect your Lovable app to [Cloudflare API](/integrations/cloudflare-api) to manage your zones and DNS records, build traffic and security dashboards, purge cache, and operate Workers, R2, and KV. It fits internal tools for the domains you already run on Cloudflare, and it does not host or publish your Lovable app on Cloudflare. Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Chat connectors: Canva and Wispr Flow

  Two tools are now available as prebuilt [chat connectors](/integrations/chat-connectors), so Lovable can use them in chat while you build.

  **Canva** connects Lovable to your Canva account to create and edit designs, search your brand assets and templates, and export finished designs.

  **Wispr Flow** connects Lovable to your Wispr Flow Notetaker so it can read your meeting notes, summaries, and transcripts.

  Add them from **Connectors**.

  ### Lovable MCP now works with Grok

  The [Lovable MCP server](/integrations/lovable-mcp-server) now works with Grok. Add `https://mcp.lovable.dev` as a custom connector in Grok and sign in with your Lovable account to build and manage your Lovable apps from Grok.

  ### Share your Lovable invite link from your phone

  You can now [share your Lovable invite link](/introduction/dashboard-overview#share-lovable) from lovable.dev in your phone's browser. Open the user menu on the dashboard or the project menu in the editor and select **Get free credits**. The referral program is not available on Enterprise plans.

  ### See what is inside a ZIP before Lovable uses it

  When you attach a ZIP file in chat, you can now click it to [see the files inside with their sizes](/features/projects/chat#attach-files-as-context) before Lovable uses them. Lovable reads only the list of files in the ZIP and does not unpack it.
</Update>

<Update label="Sep 9, 2026">
  ### Explore changes with drafts

  You can now [try changes in a draft](/features/drafts), a separate copy of your project with its own chat, preview, and edits. Explore an idea or compare approaches without changing the main version of your project, then accept the draft to add its edits to your project, or delete it to discard them. Your published app changes only when you publish, not when you accept a draft. Drafts share your project's data, so anything you add or change while testing is real. Some backend changes still have to be made in the main version of your project. Open the draft switcher from your project's name at the top of the editor.

  ### Redesigned Chat actions menu in projects

  The [Chat actions menu](/features/projects/chat#chat-actions), the **+** button next to the message input in a project, has a new layout. Related actions are grouped together, and a search box at the top finds any action by name. **Attach files** remains one click away.

  ### Compare and restore earlier versions of a plan

  When Lovable revises a plan, it now [keeps the earlier versions](/features/plan-mode#browse-plan-versions). Use the undo and redo arrows above the plan to compare versions, and select **Save** to keep an earlier version, or your own edits, as the plan to approve. The **Show changes** view of revised plans has been removed.

  ### Readable previews for CSV and TSV files

  CSV and TSV files you [attach in chat](/features/projects/chat#attach-files-as-context) now open as a table with numbered rows and lettered columns. For a large file, Lovable shows the first 500 rows and 50 columns, with a note to download the file for the rest.
</Update>

<Update label="Sep 8, 2026">
  ### Send follow-ups while Lovable works, replacing the message queue

  You can now [send a follow-up](/features/projects/chat#send-follow-ups-while-lovable-works), a correction, or a new idea while Lovable is still working, in Build or Plan mode. Lovable picks up your message at its next natural stopping point and includes it in the work without losing anything it has already done. Follow-ups replace the message queue, which is deprecated and remains only for accounts that actively used it recently. If you still have the queue, you can switch to follow-ups in your account settings.

  ### Lovable signs in to test pages behind your app's login

  When Lovable [tests your app in a browser](/features/browser-testing) and reaches a login screen, it can now sign in to your app and check the pages behind the login, such as dashboards and account pages. Your app's sign-in must run on the built-in backend (Cloud). If your app has exactly one user, Lovable signs in as that user. If your app has several users and you have not said which one to use, Lovable asks you in chat before signing in. Workspace admins and owners can also ask Lovable to sign in as a specific person.

  ### GPT-6 Astra, Gemini 3.8 Flash, and Gemini 3.5 Transcribe for your app's AI features

  Your app's [AI features](/features/ai) can now use three new models:

  * **GPT-6 Astra**, OpenAI's most capable model for complex reasoning, coding, research, and document creation. It comes at a premium price.
  * **Gemini 3.8 Flash**, the new default chat model. It accepts text, image, audio, and video input.
  * **Gemini 3.5 Transcribe**, the new default speech-to-text model. It detects the spoken language automatically across more than 85 languages.

  Ask Lovable to use any of these models in your app, or describe what you want and let Lovable pick.

  ### Project files no longer copy automatically during a remix

  Files uploaded to a project's **Files** tab no longer copy automatically when the project is [remixed](/features/projects/remix). Anyone who remixes your project through its public link gets the code only, without your files or chat history. People with edit access to the original project can include the files by enabling **Copy project files to new project** in the **Remix dialog**, next to the existing **Include project history** switch for the chat history.
</Update>

<Update label="Sep 7, 2026">
  ### Redesigned Cloud Advanced settings show when your database is under pressure

  Your project's [Cloud Advanced settings](/features/advanced-settings) have a new layout. Three cards at the top, **CPU**, **Memory**, and **Disk**, show hour by hour whether your database was under pressure during the last 24 hours. Use them to check your database's resource health before you resize it. When a card shows pressure, select **Ask Lovable**. Lovable then inspects your database and suggests query or code changes that reduce the load, so you may not need a larger instance. The request uses credits like any other message. Below the cards, **Database size** and **Database storage** each have a row with a **Manage** button, and **Database location** shows the region and PostgreSQL version.

  ### Transfer primary ownership of your workspace

  The primary owner of a workspace can now [transfer primary ownership](/features/people#transfer-primary-ownership) to another person from **Workspace settings → Workspace → Workspace access**. Choose an active member or enter the email address of another Lovable account. That person becomes the primary owner, the account Lovable uses for billing and domain claims, and you remain an owner. When a workspace has several owners, the primary owner is marked **Owner\*** in **People**.

  ### Connect your app to Gong

  You can now connect your Lovable app to [Gong](/integrations/gong) to read sales call metadata, transcripts, conversation topics, interaction stats, and user data from your Gong account. It fits call review dashboards, transcript search, and sales coaching scorecards. Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Send app emails from TanStack Start projects without Cloud

  You can now set up [app emails](/features/custom-emails#prerequisites) on TanStack Start projects without enabling Cloud first. React + Vite projects and authentication emails need Cloud. App emails are available on paid plans.

  ### See when a custom domain stops working

  Lovable now [checks each live custom domain](/features/custom-domain#domain-statuses) when you open your project's domain settings. If Lovable can no longer serve your project on a domain, that domain shows **Connection issue**, along with what Lovable found, when it last checked, and what to do next. If Lovable cannot complete the check, the domain shows **Check failed** instead. Select **Check status** to run the check again.

  ### The publish dialog shows a custom domain that is still being set up

  While Lovable is setting up a custom domain you bought, or the first one you connected to the project, the [publish dialog](/features/publish#the-publish-dialog-step-by-step) now shows that domain under the **Website URL** with a note that setup is in progress. Lovable publishes your app to its `lovable.app` address until the domain is **Live**.

  ### Connector forms are split into collapsible sections

  The forms for [adding a connection](/integrations/app-connectors#create-a-connection), setting up an app user connector client, and creating a custom connector are now split into collapsible sections. A collapsed section shows a summary of what you chose. The button that saves the form stays visible at the bottom while you fill it in.

  ### Faster payments dashboard

  The [payments dashboard](/features/payments) in your project now loads faster for sellers with a long payment history. Revenue analytics can be a few minutes behind your payment provider's dashboard.
</Update>

<Update label="Sep 4, 2026">
  ### Manage and protect your preview links

  You can now create several [shared preview links](/features/share-project#share-preview-links) for the same project, give each one a name, and decide per link whether guests can comment. The **Share** dialog shows every active link, and when you delete a link, it stops working immediately. On Business and Enterprise plans, you can also enable **Require a password** and set **Link expiration** to 24 hours, 7 days, 30 days, or never. Reviewers enter the password before they see the preview or its comments. On Free and Pro plans, links expire after 7 days.

  ### Choose who inherits a member's projects

  When you [remove someone from your workspace](/features/people#remove-a-member), you can now choose which member takes over the projects and folders they owned, and unpublish the ones that are live in the same step.

  ### New ways to open project settings

  The project name menu has been removed. You now open [project settings](/features/projects/settings#where-to-find-project-settings) from the editor's sidebar, the **More** tab, or the **Chat actions** menu. Hover the menu icon in the top-left corner to reveal the sidebar temporarily, or click it to keep the sidebar open, then select **Settings**. In the project toolbar, select **More**, then **Settings**, to change the project's general settings, knowledge, domains, and Git connection without leaving the editor. You can also choose **Settings** in the **Chat actions** menu next to the chat input, or press **Cmd+.** (Mac) or **Ctrl+.** (Windows/Linux) anywhere in the editor.
</Update>

<Update label="Sep 3, 2026">
  ### See how your workspace adopts Lovable

  You can now see how your workspace adopts Lovable in [Insights](/features/insights), under **Workspace settings → Workspace → Insights**: visits to published apps, active apps, active builders, and connections added over the last 30 days, each compared with the 30 days before. Insights also ranks your top apps by visits, with a summary of what each app does and who built it, lists every workspace member by edits, and exports both lists to CSV. It is available to workspace admins and owners on Business and Enterprise plans, and it does not use credits.

  ### Open the dashboard sidebar from inside the editor

  You can now open the [dashboard sidebar from inside the editor](/features/projects/editor#sidebar). Hover the menu icon in the top-left corner to reveal it, click the icon to keep it open, or press **\[** to show and hide it. From there you can switch workspaces, open another project or folder, search, and reach **Connectors** and **Settings** without leaving the project.

  ### Gemini Omni 1.1 Flash for your app's AI features

  Your app's [AI features](/features/ai#video-models) can now generate video with Google's **Gemini Omni 1.1 Flash** (`google/gemini-omni-1.1-flash`). Besides creating new clips from a prompt or an image, it can change what an existing video shows and extend it into a longer one, including footage your app's users upload.

  ### Set the upload size limit for Cloud storage

  You can now set the largest file your app's [storage](/features/storage) accepts, up to 5 GB (the default is 2 GB). Change it under **Upload size limit** at the top of **More → Cloud → Storage**, or ask Lovable in chat, and it asks for your approval before making the change.
</Update>

<Update label="Sep 2, 2026">
  ### Download the mobile app from your settings

  You can now get the [Lovable mobile app](/integrations/lovable-mobile-app) from **Account settings → Devices & apps**. The new **On your phone** section sits next to the desktop app downloads and shows a QR code for the iOS app and one for the Android app. Scan a code with your phone to open the app's App Store or Google Play listing, or use the store buttons.
</Update>

<Update label="Sep 1, 2026">
  ### Find, buy, and connect a domain from chat

  You can now ask Lovable in a project to set up a [custom domain](/features/custom-domain). Describe the kind of name you want and Lovable shows what is available with prices, and buying the one you pick continues in checkout. If you already own a domain, Lovable connects that one instead, and you can ask about a domain's status at any time. Lovable always shows a confirmation card before it buys or connects a domain. Buying a domain is limited to workspace admins and owners on paid plans.

  ### Lovable in Slack is now available on Enterprise

  [Lovable in Slack](/integrations/lovable-for-slack) now works in Enterprise workspaces, so it is available on every plan. A workspace admin or owner connects Slack once from **Workspace settings → Slack**, or installs Lovable from the Slack Marketplace.

  ### Connect a tool from a pasted API key

  When you paste an API key into a project's chat and Lovable recognizes which tool it belongs to, it now offers to set up a [connector](/integrations/introduction) for that tool. A connection lives in your workspace, so you can reuse it across projects and choose who else can use it, and your key is still saved as a project secret either way.

  ### Empty project groups no longer show in the sidebar

  The **Projects** section of the [dashboard sidebar](/introduction/dashboard-overview) now shows **Owned by me** and **Shared with me** only when they have something in them.
</Update>

<Update label="Aug 31, 2026">
  ### Create a connector for any API

  Workspace admins and owners on any plan can now [create a custom connector](/integrations/create-connector) for any REST API. In **Connectors**, select the **+** button and choose **Custom connector**, then describe the API: where requests go, how it expects credentials, and optional knowledge files that teach Lovable how to call it. The connector appears in your workspace's catalog, and members connect to it and build with it like any other connector.

  ### Priority processing now works with Gemini chat models

  Your app's AI features can now use [priority processing](/features/ai#faster-responses-with-priority-processing) on supported Gemini chat models, not only on OpenAI models. Ask Lovable to make an AI feature respond faster, and it uses priority processing instead of switching you to a smaller, faster model. It comes at a premium price.
</Update>

<Update label="Aug 30, 2026">
  ### Set a goal for Lovable

  You can now [set a goal](/features/goal-runs): type `/goal` at the start of a build message, or pick **Goal** from the menu that opens when you type `/`, then describe what you want done. Lovable works on that one message until the goal is achieved, for up to 10 hours, without pausing to ask you questions, and builds the finished version of what you asked for. A goal costs noticeably more than a regular build message, and credit check-ins still pause the work at your check-in level.
</Update>

<Update label="Aug 28, 2026">
  ### Connect your app to GitLab API

  You can now connect your Lovable app to [GitLab API](/integrations/gitlab-api) to list projects, branches, commits, and repository files, create and update issues and merge requests, and read pipelines, on GitLab.com, GitLab Self-Managed, and GitLab Dedicated. It fits issue triage boards, merge request review queues, and delivery dashboards. The connector also supports [per-user access](/integrations/app-user-connectors), where each person who uses your published app connects their own GitLab account. Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Connect your app to Firebase Cloud Messaging

  You can now connect your Lovable app to [Firebase Cloud Messaging](/integrations/firebase-cloud-messaging) to send push notifications to a device or broadcast to a topic, including browser push for people who opt in on your web app. It fits order tracking, appointment reminders, and ops alerts. Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Fewer preview reloads while you edit

  The [preview](/features/projects/preview) now keeps what you have on screen in place while Lovable works, instead of reloading after each change. Selecting elements also keeps working from one edit to the next, so you can make several visual edits in a row.
</Update>

<Update label="Aug 27, 2026">
  ### Restrict external invites to verified email domains

  On Business and Enterprise plans, workspace admins and owners can now [restrict external publish invites](/features/privacy-and-security-settings#who-can-receive-external-invites) to email addresses on your company's [verified domains](/features/verified-domains). In **Workspace settings → Security → Privacy & security**, under **External invites**, set **Who can receive external invites** to **Verified-domain emails only**. Members can then [invite people outside the workspace](/features/publish#invite-people-outside-your-workspace) only if their address is on a domain your company has verified, such as colleagues who aren't in the workspace. The publish dialog shows why other addresses can't be invited, and people who were already invited keep their access.

  ### Faster command palette

  The [command palette](/introduction/project-search-and-find#command-palette) (**Cmd+K** on Mac, **Ctrl+K** on Windows) now opens faster. Characters you type while it opens are no longer lost, and it highlights your most recent project first, so you can press **Enter** to open it right away.
</Update>

<Update label="Aug 26, 2026">
  ### Chat with Lovable in Slack

  You can now [chat with Lovable without leaving Slack](/integrations/lovable-for-slack). Mention `@Lovable` in a channel or send it a direct message to create a project, update an existing app, ask what changed, or ask about the data inside an app you built. Lovable replies in a thread, shows its progress while it works, and several people can iterate on a shared app in the same thread.

  Everything happens in your Lovable workspace: you work with the same projects under the same permissions, anything you start in Slack you can continue in Lovable, and messages use your workspace's credits, counted against the person who sent them. Lovable reads recent messages in the conversation for context, so you don't have to re-explain what your team was discussing, and it can pull in context from your workspace's connected tools, like Linear or Notion.

  A workspace admin connects Slack once, from **Workspace settings → Slack** in Lovable or by installing Lovable from the Slack Marketplace, and teammates are recognized automatically the first time they talk to it. Available on Free, Pro, and Business plans.

  ### Add your app to Slack as an agent

  You can now [add an app you built to your team's Slack workspace](/integrations/slack#add-your-app-to-slack-as-an-agent) as its own Slack app, without a Slack developer account or copying keys between Slack and Lovable. A workspace admin or owner authorizes your Slack workspace once from **Connectors → Slack → Your apps in Slack**. Then publish your project, ask Lovable to add it to Slack, and publish once more so the app receives its Slack keys. Teammates use the app by mentioning it in a channel or messaging it directly, and it answers under its own name with the behavior you built. Manage or remove the apps you added from the same **Your apps in Slack** section.

  ### Lovable works up to 10 hours on a single message

  Lovable now works on every build message for [up to 10 hours](/features/agent-mode#how-long-lovable-works-on-one-message) before it wraps up, so a large task is more likely to finish in a single message. Build messages are billed on the work Lovable does, so a message that runs for hours costs more credits than a short one. [Credit check-ins](/introduction/credits-and-usage#build-costs) still pause the message at your check-in level.

  ### See how each app page appears in search results and link previews

  In the [page selector](/features/projects/preview) above the preview, hover the preview icon on any of your app's pages to see its **Social** and **Search** cards: the title, description, social image, and favicon that search engines and social platforms show for that page. The cards reflect your latest changes, even before you publish. To change any of it, select **Ask Lovable to edit** and describe the change in chat. The publish flow leads to the same cards: in the Publish dialog, select **Social & search appearance** in the **⋮** menu or click the favicon next to the website URL, and after publishing, click **Edit** next to your site's title on the **Your website is live** screen. On mobile, open **Social & search** from the preview actions menu.

  ### Record who is behind each commit Lovable pushes

  On Business and Enterprise plans, workspace admins and owners can now enable [**Include member email addresses in commits**](/integrations/git-sync-overview#commit-attribution) in **Workspace settings → Git**. While it is enabled, commits Lovable pushes to a connected GitHub or GitLab repository record the email address of the member whose change produced them, on its own line in the commit message. Commits Lovable makes on its own, such as when you publish, carry no address. The setting is disabled by default.

  ### Log out everywhere

  You can now [sign out of your Lovable account on every device at once](/introduction/lovable-account-settings#log-out-everywhere). In **Account settings → Security**, the **Log out everywhere** button ends your sessions on all devices and browsers, including the one you are using. You confirm first, then sign in again wherever you want to keep using Lovable.

  ### Connect GitHub API by signing in with your GitHub account

  You can now connect the [GitHub API connector](/integrations/github-api) by signing in with your GitHub account, instead of creating a personal access token first. When you add a connection, select **GitHub** under **Authentication** and authorize with your account. Connecting with a personal access token still works, for example to limit access to specific repositories with a fine-grained token.

  ### Workspace build secrets appear in your project's secrets list

  On Enterprise plans, [build secrets](/features/secrets#workspace-build-secrets) set for the whole workspace now appear in your project's **Secrets** list (**More → Cloud → Secrets**), in a dimmed row with your workspace avatar. They are read-only there: you see the name, never the value, and **View workspace secrets** opens the workspace settings where admins and owners manage them. Seeing workspace rows requires workspace editor access or above.

  ### Resources removed from the dashboard sidebar

  The **Resources** item has been removed from the dashboard sidebar. Find templates on the **Lovable templates** tab on the dashboard, or at [lovable.dev/dashboard/templates](https://lovable.dev/dashboard/templates).
</Update>

<Update label="Aug 25, 2026">
  ### See time and cost while Lovable works

  You can now check what a message has cost so far, without waiting for it to finish. In the project chat, open the **More options** menu under the message to see [the time spent and the credits used](/features/projects/chat#see-time-and-cost-while-lovable-works), so you can follow a long message as it runs.

  ### Filter audit logs by client

  Enterprise audit logs now record which app each action came from: **Web**, **Desktop app**, **iOS app**, or **Android app**. [Filter the log by client](/features/audit-logs#filtering-audit-logs) to narrow it to one app, or select a member's name to see the **Client** behind a single event. Use **Unknown** for events with no recorded client, including everything from before August 24, 2026.

  ### Previews retry when your connection drops

  [Previews](/features/projects/preview) now retry on their own when your connection drops while a preview is starting, instead of failing on the first dropped request. If a teammate is opening the same preview, your connection dropping no longer interrupts theirs.

  ### Only Free and Pro projects are eligible for LinkedIn skills

  To unlock a [LinkedIn skill](/introduction/lovable-account-settings#how-to-qualify-for-a-skill), a project must now be in a workspace on a Free or Pro plan. Projects in Business and Enterprise workspaces are never eligible, and that does not change if the workspace later moves to a different plan. This applies to projects you have already built, so Lovable can change or remove a skill that is already on your LinkedIn profile.
</Update>

<Update label="Aug 24, 2026">
  ### Let your app's users connect their own GitHub account

  The [GitHub API connector](/integrations/github-api) now supports [per-user access](/integrations/app-user-connectors). Each person who uses your published app connects their own GitHub account, so the app reads and writes only the repositories, issues, and pull requests that user can reach, acting on their behalf. This is different from a standard GitHub API connection, where you connect one account once and every visitor shares it, and from GitHub Git sync, which syncs your project's code to a repository.

  As the builder, you create one GitHub OAuth app for your workspace and add it from **Connectors → GitHub API → Add connection → App user connector**. Each user then signs in with their own GitHub account the first time they use it.

  ### Chat Latest for your app's AI features

  Your app's [AI features](/features/ai) can now use **Chat Latest** (`openai/chat-latest`), the latest Instant model ChatGPT uses, tuned for conversational chat. It accepts text and images as input and responds with text. It answers directly instead of reasoning first, so it cannot show its thinking, and it is not available for priority processing. OpenAI regularly changes the model behind this name, and what it costs can change with it, so pick a numbered GPT model when you need responses and cost to stay predictable.

  ### Add an MCP registry from the catalog header

  You can now add an [MCP registry](/integrations/mcp-registries), a browsable directory of MCP servers, from the **+** button in the **Connectors** catalog header: select **MCP registry** and fill in the form. **Add registry** in the **MCP registries** section still works too. Once the registry connects, Lovable opens its browse page so you can start connecting servers right away. Only workspace admins and owners can add a registry.

  ### Contact Enterprise support from your project

  On Enterprise plans, you can now reach support without leaving a project. Select the project name in the editor, then **Contact support**, and describe what is going wrong. You can attach up to 5 JPG or PNG files, 5 MB across all of them. Your project, workspace, and account details are attached automatically, so support has the context without you filling anything in. Support replies by email, and everyone with access to the project can use it.
</Update>

<Update label="Aug 21, 2026">
  ### Export designs from Figma with the Lovable plugin

  You can now use the [Lovable plugin for Figma](/integrations/figma) to send designs from Figma into Lovable. In Figma, open any file, select **Plugins** in the right panel, search for **Lovable**, and run **Lovable: Import from Figma**. Pair it with your Lovable account using the code it shows, select the frames you want, and export them. The designs then appear under **Figma designs** in the `+` menu in chat, ready to attach to a message. One export can carry up to 100 generated files, each up to 20 MB. Exported designs stay private to your own account rather than being shared with your workspace. Exporting is free, and building with a design uses credits like any other message.

  ### Ask Lovable about your plan and subscription

  You can now [ask Lovable which plan your workspace is on](/introduction/credits-and-usage#tracking-credit-usage) and whether its subscription is active, and get the answer in chat instead of opening settings. Lovable shows it alongside your credit usage when you ask about credits, spend, or your plan. Plan and subscription answers are available to editors, admins, and owners, and the question uses credits like any other message.

  ### Project details when you hover the sidebar

  On desktop, hovering a project in the sidebar now shows more than its screenshot. The preview card also gives the project name, a **Published** badge when the site is live, the owner's avatar, and when it was last edited, so you can tell similar projects apart without opening them. It appears in the sidebar on both the dashboard and the editor.
</Update>

<Update label="Aug 20, 2026">
  ### Gemini Embedding 2 is the default for search and recommendations

  Lovable now uses [**Gemini Embedding 2**](/features/ai#embedding-models) (`google/gemini-embedding-2`) whenever it builds semantic search, recommendations, or retrieval-augmented generation (RAG) into your app. It handles images, audio, video, and PDFs as well as text, where the previous default, Gemini Embedding 001, handled text only. Your existing features keep working: Lovable still uses Gemini Embedding 001 for tables that already store its vectors.

  ### Sort connectors and add an MCP server from the catalog header

  In **Connectors**, the sort control and the button for [adding your own MCP server](/integrations/custom-mcp) now sit in the catalog header. Sort the catalog by **Popular**, **A to Z**, or **Z to A**, and Lovable remembers your choice. A plus button in the header replaces the card that used to sit at the end of the grid.
</Update>

<Update label="Aug 19, 2026">
  ### Design systems on all paid plans

  [Design systems](/features/design-systems) are now available on all paid plans. Create a design system and attach it to your projects so every build inherits your components, tokens, and design rules. Wrapping an existing npm package as a design system is available on Enterprise plans only.

  ### A simpler Publish dialog

  You can now [publish your project](/features/publish) from a single view: select **Publish** to check your site's URL, visibility, and security scan, then select **Publish** again (or **Publish changes** if your site is already live). Lovable generates your site title, description, and icon while it builds your app, so there is nothing to enter manually. To change how your site appears in browser tabs, search results, and link previews, ask Lovable in chat.

  ### Lovable can use your connected service account while building

  If your app uses an [app user connector](/integrations/app-user-connectors#let-lovable-use-your-account-while-building), you can now let Lovable use your own account with the service while it works on the project. Ask Lovable to inspect or test the service in chat, select **Connect** on the card that appears, and sign in. Lovable can then check real schemas, run test queries, and verify API calls under your own permissions instead of guessing. The connection is private to you and limited to that project: other project members and app users can't use it, your app's code can't access it, and Lovable asks for approval before anything that could change data in the service. Revoke access at any time by asking Lovable in chat.

  ### Per-user access for Amazon Redshift

  Each user of your published app can now [query Amazon Redshift as themselves](/integrations/amazon-redshift#per-user-access-with-the-app-user-connector). Users sign in with your organization's identity provider (for example Okta, Entra ID, or Auth0), and their queries run under their own Redshift permissions. Set it up from **Connectors → Amazon Redshift → Add connection → App user connector**. The setup requires IAM Identity Center in your AWS organization.

  ### Faster preview loading

  [Previews](/features/projects/preview) now appear as soon as your app is ready, instead of waiting for the next status check. The improvement is most noticeable when you open a project that hasn't been used for a while.
</Update>

<Update label="Aug 18, 2026">
  ### Running out of credits mid-message now pauses your work

  If your workspace [runs out of credits](/introduction/credits-and-usage#what-happens-when-you-run-out-of-credits) while Lovable is working on a message, the message now pauses rather than ending, and a card in chat lets you decide what happens next. Choose **Add credits** to top up and resume the message where it left off, or **Wrap up** to have Lovable finish what's in progress and stop instead of starting anything new. If you can't manage billing for the workspace, the card shows **Ask an admin** instead, and once credits are available again, for example after an admin tops up or a new grant arrives, the card offers **Resume**. There is no deadline: paused work waits until you decide. The pause applies to Build mode messages you send in the editor.

  ### Gemini 3.7 Flash is now the default model for your app's AI features

  Your app's [AI features](/features/ai) now use **Gemini 3.7 Flash** (`google/gemini-3.7-flash`) by default when they don't specify a model, replacing Gemini 3.6 Flash. Lovable also uses it when it builds new AI features for your app. Apps that already specify a model are unaffected, and no changes are needed on your side.
</Update>

<Update label="Aug 17, 2026">
  ### Credit check-ins for long-running messages (beta)

  You can now let Lovable [check in on the cost of long-running messages](/introduction/credits-and-usage#build-costs). When a single message crosses your check-in level, 20 credits by default, Lovable pauses and shows what the message has cost so far. Choose **Continue** to keep going, optionally typing a new check-in level first (it becomes your default), or **Wrap up** to have Lovable finish what's in progress and stop instead of starting anything new. A check-in is not a hard cap: a run can go slightly past the level before pausing, and sending a new message resets the count. Disable check-ins with **Don't ask again** on the card, or manage them in your account settings under **Long-running credit check-ins**. Check-ins apply to the messages you send while working in the editor. The feature is in beta.

  ### Trust center is now disabled by default

  Your app's [Trust center](/features/trust-center) is now disabled by default. To publish the trust page for your app, enable **Trust center** in **Project settings → Publishing**. Trust pages that were live before are offline until you enable the setting. Enabling it applies to your current published version within a few minutes, no republish needed. Disabling it takes the page offline right away. Project admins and owners can change the setting.

  ### Improved image viewer

  Opening an [image attached in chat](/features/projects/chat#attach-files-as-context) now magnifies instead of starting a drawing. Click the image to zoom in at your cursor, drag to pan, and zoom up to 200% with the zoom controls, a pinch, or Ctrl+scroll. To draw on the image, select **Draw** in the viewer, sketch, and choose **Save** to attach your annotated copy or **Cancel** to discard it. The same viewer opens images that Lovable shows in chat, like screenshots of your app from its work. There, **Add to chat** attaches the image you're viewing to your next message, so you can point at what Lovable showed you and ask for changes.

  ### Gemini 3.7 Flash for your app's AI features

  Your app's [AI features](/features/ai) can now use **Gemini 3.7 Flash** (`google/gemini-3.7-flash`), Google's latest generation Flash model for fast coding, reasoning, and agentic workflows. It accepts text, images, audio, and video as input and responds with text.

  ### Workspace insights is now Security insights

  The Security center tab called **Workspace insights** is now **[Security insights](/features/security-insights)**, a clearer name for what it shows: security, ownership, and activity signals across your projects. Find it in **Settings → Security → Security center**. The functionality is unchanged. Available to workspace admins and owners on Business and Enterprise plans.

  ### Copy a project link in the mobile and desktop apps

  The [mobile app](/integrations/lovable-mobile-app) and [desktop app](/integrations/desktop-app) have no address bar, so there was no way to copy a project's URL. Now you can tap or click the project name and choose **Copy project link** to copy a link that opens the project. If copying fails with an error in the mobile app, update the app to the latest version.

  ### Improved validation for attachment uploads

  Files you [attach in chat](/features/projects/chat#attach-files-as-context) are now validated against your plan's file size limit up front. A file that is too large is rejected the moment you attach it, with a message stating the maximum size. Limits are applied consistently across all plans, and Enterprise plans can now attach files up to 1 GB.
</Update>

<Update label="Aug 16, 2026">
  ### Attach a Figma file in chat

  Drop a `.fig` file into the [chat](/features/projects/chat#figma-fig-files) and Lovable reads the design data inside: variables, colors, typography, and frame structure, plus the preview image saved in the file. The file is parsed in your browser, and Lovable uses it as styling context to match your design, so tell it in your prompt what you want built. Use a `.fig` attachment to hand off a design without keeping Figma open. For iterative work against a live Figma file, [connect Figma through the desktop app](/integrations/desktop-app#connect-figma) instead.

  ### Set member credit limits in bulk with a CSV

  Workspace admins and owners on Enterprise plans can now [import credit limits from a CSV](/features/people#import-credit-limits-from-a-csv) to set per-member limits for many members at once. In **Settings → Access → People**, select **Import limits** and upload a CSV of member emails and monthly limits, or start from the downloadable template. Lovable checks every row before anything is applied, and each limit is the member's final monthly cap, not an amount added on top of their current limit.

  ### Lovable MCP updates

  The [Lovable MCP server](/integrations/lovable-mcp-server) is now available as an app in [Strawberry Browser](https://strawberrybrowser.com), so you can ask the browser's assistant to create and manage Lovable apps. Add it from Strawberry's **Apps** tab.
</Update>

<Update label="Aug 14, 2026">
  ### Set up Entra ID single sign-on from the Microsoft app gallery

  Lovable is now a verified app in the Microsoft Entra ID app gallery. Workspace admins and owners on Business and Enterprise plans can find Lovable in their Entra app catalog and set up [single sign-on](/features/business/sso) from a pre-built app, instead of registering one for Lovable by hand. You still copy your tenant's issuer URL, client ID, and client secret into Lovable, in **Settings → Access → Identity**.

  ### Download your codebase from Git settings

  You can now [download your project's code](/features/code-mode#download-your-projects-codebase) from **Project settings → Git** as well as from the code editor. The **Download codebase** section sits next to the GitHub and GitLab connection options and saves a one-time copy of your project as a `.zip` file, no repository connection needed. It's available on paid plans to everyone with edit access to the project.
</Update>

<Update label="Aug 13, 2026">
  ### Microsoft sign-in for your app

  Your app's users can now [sign in with their Microsoft account](/features/microsoft-auth), alongside Google and Apple. In your project, open **Cloud → Users → Auth settings**, select **Microsoft** under **Sign in methods**, and turn on **Enable Microsoft sign-in**, or ask Lovable to add Microsoft sign-in to your app. Lovable manages the OAuth credentials by default, so no Azure setup is needed. Switch to **Your own credentials** to use your own Azure app registration, show your own app name on the consent screen, and limit sign-in to your organization. Microsoft sign-in is part of the built-in authentication for apps on Lovable Cloud.

  ### Build dashboards from your Snowflake semantic views

  Ask Lovable for dashboards, KPIs, or analytics on a project with a [Snowflake](/integrations/snowflake) connection and it now checks your account for semantic views, the metric definitions your data team maintains in Snowflake, and builds on those instead of writing its own SQL over base tables. The numbers in your app match your BI tools because both read the same definitions. You don't have to mention semantic views: ask for a revenue dashboard and Lovable looks for a matching view first, falling back to your tables when none fits. Queries need a warehouse your Snowflake role can use, and the role needs access to the semantic views.

  ### Image editing with OpenAI models for your app's AI features

  Your app's [AI features](/features/ai) can now edit images with OpenAI's image models, GPT Image 2 and GPT Image 1 Mini, which previously could only generate new ones. Ask Lovable to build a feature where people upload a photo and describe a change, and it adds image editing to your app. Edits can change the whole image or only an area you mark, like swapping the background while leaving the rest untouched. Editing an image uses credits based on the model and the work performed, like other AI usage.

  ### Open projects from links in the command palette

  You can now [paste a project's link into the command palette](/introduction/project-search-and-find#open-a-project-by-id-or-url) (**Cmd+K** on Mac, **Ctrl+K** on Windows) to jump straight to it. Paste the project's editor URL, a link to a page inside the editor such as its settings, or the bare project ID. If you have access to the project, it appears at the top of the results, and **Enter** opens it. This helps most in the [desktop app](/integrations/desktop-app), which has no address bar to paste a link into.
</Update>

<Update label="Aug 12, 2026">
  ### Unpublish several projects at once

  On the dashboard, you can now [unpublish several projects at once](/features/publish#how-to-unpublish-your-project) instead of opening each one. Select the projects, choose **Unpublish** in the toolbar at the bottom, and confirm: the selected apps go offline and their published URLs stop working, and you can republish them anytime. The action is available when every selected project is published.
</Update>

<Update label="Aug 11, 2026">
  ### Readable previews for attached files

  Click any file you [attach in chat](/features/projects/chat#attach-files-as-context) to open a preview. Code files now open with syntax highlighting in the code editor's colors, soft-wrapped lines, and the language named instead of a bare file extension. Markdown files open as formatted text, with a **Preview** and **Source** switch for the raw file. Files over 1 MB can't be previewed, but they still work as context.

  ### Limit on free fixes

  Your account includes 10 free fixes, covering both **Try to fix** on build errors and the fixes offered by security scans, in all your workspaces and projects. Each fix you use becomes available again 24 hours later. Past the 10, a fix runs as a normal chat message and uses credits like any other request. Security scans themselves are unaffected and stay free. See [Fix errors and get unstuck](/features/projects/chat#fix-errors-and-get-unstuck).
</Update>

<Update label="Aug 10, 2026">
  ### Agent integrations for workspace-published apps

  Agent integrations are no longer limited to publicly published apps. On Business and Enterprise workspaces, an app published to your workspace can now have an [agent integration](/features/agent-integrations) too, so AI assistants such as ChatGPT and Claude can use your internal tools. The app stays private to your workspace, and its tools always require sign-in.

  Connecting works like it does for public apps, with one extra step: when someone adds the MCP link to their assistant, they first sign in with their Lovable account to pass the workspace access check, then sign in to the app itself. See [Workspace-published apps](/features/agent-integrations#workspace-published-apps).

  ### Connect MCP servers from a registry

  Workspace owners and admins can now add an [MCP registry](/integrations/mcp-registries) to their workspace: a browsable directory of MCP servers. Members pick a server from the directory and connect it in a couple of clicks instead of pasting server URLs by hand. Connections stay personal, like other [chat connectors](/integrations/chat-connectors).

  ### Security scan setting removed from workspace settings

  The **Require basic security scan before first publish** setting in **Settings → Privacy & security** has been removed. Lovable runs a basic [security scan](/features/security) automatically for every publish, so the setting no longer changed anything. Workspaces that had it enabled lose nothing, and publishing behaves the same as before.
</Update>

<Update label="Aug 7, 2026">
  ### Trust Center for your published app

  Every app you publish publicly now gets a [Trust Center](/features/trust-center): a security page that Lovable generates at `/.well-known/trust.html` on your app's domain, listing the security facts Lovable observed about the exact version that is live. A machine-readable twin at `/.well-known/trust.json` serves procurement tools and AI agents. When a customer asks whether your app is secure, you can answer with a link instead of a questionnaire. The Trust Center is informational, not a certification or an audit, and it doesn't use credits. Apps published only to workspace members don't have one, and apps published before the Trust Center existed need a republish to get their page.

  ### Veo 3.1 video models for your app's AI features

  Your app's [AI features](/integrations/ai) can now use Google's **Veo 3.1** video models to generate short video clips with sound, from a text prompt or from an image. Generating video uses credits, charged per second of the finished clip and only when a generation succeeds.

  ### Reworked AI model training settings

  The [AI model training controls](/features/business/data-opt-out) have new names and their own settings section. In account settings, the **Privacy** section is now called **AI model training**, and the **Data collection opt out** toggle in it is now **On Your Customer Content**: enabled means your content may be used to train Lovable's AI models, disabled means it isn't.

  In **Settings → Privacy & security**, the workspace-level toggle moved from **Data protection** to its own **AI model training** section and is now called **On Workspace Data**. Workspace admins and owners on Business and Enterprise plans manage it, and an account-level opt-out always applies regardless of the workspace setting. Your previous selections carry over for both settings.

  ### Unlimited email invites on paid plans

  Pro, Business, and Enterprise workspaces can now [invite as many members by email](/features/people#invite-members) in a day as they need, from **Settings → People**. Previously, a Pro workspace could send 20 email invitations a day and a Business workspace 100. Free workspaces keep their limit of 5 email invitations per day.
</Update>

<Update label="Aug 6, 2026">
  ### Turn off the live preview

  You can now turn off the [live preview](/features/projects/preview#turn-off-the-live-preview) if it is slow for a big project. In **Project settings → General → Preview**, switch off **Live preview**, and the preview panel shows the latest built version of your app instead of running it on a live dev server. It updates when Lovable finishes a change rather than while it works.

  Lovable still builds and tests your changes, and still sees runtime errors, console output, and network requests from the built preview. Holding **Shift** while selecting **Refresh** no longer restarts the preview environment. The setting applies to the whole project: everyone who opens it sees the built version, and project editors can turn it back on at any time.

  ### Show the AI's thinking in your app

  Your app's [AI features](/integrations/ai) can now show the model's thinking above the answer as it works, so people see progress instead of waiting at a blank screen. Ask Lovable to show the model's thinking and it sets that up on the model your app already uses. What appears is a summary of how the model worked through the problem, not its raw internal steps, and it only appears when your app asks for it.

  Thinking counts toward the answer's output, so showing it costs more than the same answer without it.
</Update>

<Update label="Aug 3, 2026">
  ### Revise a plan by highlighting the part you want changed

  In Plan mode, you can now highlight any part of a plan and say what should change about that section. A small box appears next to your selection with **Describe the change...**, and Lovable edits just that part of the plan instead of rewriting the whole thing.

  [Revised plans](/features/plan-mode#revise-a-specific-part-of-the-plan) open as a diff, so you can see what moved: removed wording is struck through and new wording is highlighted. Switch between **Show changes** and **Edit plan** above the plan. You can highlight text in the diff as well, and because each revision is a Plan mode message, it costs one credit. The diff is not available in the plan view on mobile.
</Update>

<Update label="Jul 31, 2026">
  ### Opt out of AI model training

  Every user, on any plan, can now set their training-data choice in advance: starting September 9, 2026, Lovable may use customer data from Free and Pro plans for AI model training unless you opt out. Go to [Account settings → Privacy](/introduction/lovable-account-settings#ai-model-training) and enable **Data collection opt out**. The setting covers only your own data and does not change the setting for other members of a workspace you belong to.

  Business and Enterprise workspace data is excluded from model training by default, so if every workspace you belong to is on one of those plans, the toggle shows as turned on and locked. Workspace admins and owners can still manage the workspace-level **Data collection opt out** in **Settings → Privacy & security**. See [Training data and privacy](/features/business/data-opt-out) for how the two controls work together.

  ### Scale your Cloud database in smaller steps

  Lovable Cloud has a new [database size](/features/advanced-settings#upgrade-instance). It sits between **Small** and the size previously called **Medium**, giving you a smaller upgrade step when **Small** is no longer enough. The new size takes the name **Medium**, and the sizes above it were renamed: the previous **Medium** is now **Large**, the previous **Large** is now **X-Large**, and the previous **X-Large** is now **2X-Large**.

  For existing databases, only the name changed: nothing was resized or upgraded, and hourly prices are unchanged. If your project runs on one of the renamed sizes, **Advanced settings** shows a **Database size names updated** notice.

  Pick a size in **Cloud → Advanced settings → Upgrade instance**, or ask Lovable in the project to resize. Resizing takes a couple of minutes and briefly interrupts your app, and you can move back down later. Project editors on paid plans can change the instance size.

  ### Lovable MCP updates

  The [Lovable MCP server](/integrations/lovable-mcp-server) is now listed as a supported MCP server in [Antigravity](https://antigravity.google/docs/mcp), so you can add it with one click instead of configuring it manually.
</Update>

<Update label="Jul 30, 2026">
  ### Opus 5

  Lovable now incorporates Claude Opus 5, improving code quality, instruction following, and performance across complex, multi-step tasks.

  ### Change the owner of several projects at once

  On the dashboard, workspace owners and admins can now [change the owner of several projects at once](/introduction/dashboard-overview#change-the-owner-of-several-projects) instead of opening each project's settings. Select the projects, choose **Change owner** in the toolbar at the bottom, pick a workspace member, and confirm. The new owner has to be an active member of the workspace with an owner, admin, or editor role.

  ### Private registry is now Managed registry

  The npm registry that Lovable hosts for your workspace is now called [**Managed registry**](/features/managed-registry), to set it apart from an external registry that you run yourself and connect through a build secret. Find it in **Settings → Build & deploy → Managed registry**. Nothing about how it works changed. The managed registry is available on Enterprise plans.
</Update>

<Update label="Jul 29, 2026">
  ### App + chat connectors: Amazon Redshift and Microsoft Fabric

  [Amazon Redshift](/integrations/amazon-redshift) lets apps run SQL statements and read the results through the Redshift Data API, on both provisioned clusters and Redshift Serverless workgroups. Use it for analytics dashboards, internal query consoles, and reports built on your warehouse data.

  [Microsoft Fabric](/integrations/microsoft-fabric) lets apps query Lakehouses, Warehouses, SQL databases, and KQL databases, including mirrored sources, through Fabric's API for GraphQL. Use it for operations dashboards, internal tools that read and write Fabric SQL databases, and apps that combine data across Fabric sources.

  Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Fewer false alarms in dependency scans

  When a dependency vulnerability is rated critical upstream but cannot affect Lovable apps (for example, a build-time dependency that never runs in your deployed app), the security scan no longer raises it as a finding you're asked to fix. The package stays in the **Project dependencies** list in your project's [**Security** view](/features/security-view) with an info marker that explains why it isn't treated as a finding, and it no longer counts toward your vulnerability totals. Existing results update the next time you select **Scan dependencies**.
</Update>

<Update label="Jul 28, 2026">
  ### App + chat connectors: Google Analytics and Xero

  [Google Analytics](/integrations/google-analytics) lets apps send page views, custom events, and conversions to a Google Analytics 4 property. Use it for marketing sites, waitlist pages, and stores that report traffic and conversions alongside the rest of your Google Analytics data.

  [Xero](/integrations/xero) lets apps read and manage contacts, invoices, bills, payments, and bank transactions, and read financial reports such as the profit and loss statement and the balance sheet. Use it for receivables dashboards, invoicing workflows, and finance reporting portals.

  Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Connect Pipedrive in one click

  You can now connect [Pipedrive](/integrations/pipedrive) by signing in with your Pipedrive account, instead of finding an API token in Pipedrive's settings. When you add a connection, choose **Connect with Pipedrive** for the one-click option, or **Use your own credentials** to keep using an API token. Connections made with your Pipedrive account refresh their credentials automatically, and Lovable routes API calls to your company's own Pipedrive domain. Connections that already use an API token keep working.

  ### Upgrade an older project to TanStack Start

  Projects built on Lovable's older React + Vite stack can now upgrade in place to [TanStack Start](https://lovable.dev/blog/building-apps-using-tanstack-start), Lovable's latest template, which renders your pages on the server so search engines and social link previews can read your content. Type `/` in the chat and choose **Migrate to TanStack Start**, start it from **Settings → General → Project actions**, or ask Lovable to upgrade your app. You confirm before anything starts.

  The upgrade runs as normal chat edits and uses credits. Your published site does not change until you publish, and you can revert from version history if anything looks off. Project editors can start an upgrade. See [Upgrade a project to TanStack Start](/features/upgrade-to-tanstack-start) for details.

  ### Verify it's you for sensitive workspace changes

  When you invite a member, change a member's role, or transfer a project's ownership in circumstances Lovable does not recognize, such as signing in from a new device and location, you may now see a **Verify it's you** step. Confirm your password, or enter the code Lovable emails you, and the change goes through.
</Update>

<Update label="Jul 27, 2026">
  ### Connect your app to PostHog

  You can now connect your Lovable app to [PostHog](/integrations/posthog) to capture product analytics events, evaluate feature flags, and send events from your backend code. It fits product analytics dashboards, feature-flagged rollouts, and landing pages that measure conversion. Add it from **Connectors**, or ask Lovable in a project to connect it. This is separate from the PostHog chat connector, which lets Lovable query your PostHog data while you build.

  ### Pick your Shopify store from a list

  When you connect an existing [Shopify](/integrations/shopify) store, Lovable now sends you to Shopify to pick it from a list instead of asking you to paste your store's admin URL. Select **Choose store**, sign in with a Shopify account that can install apps for the store, and choose from the stores that account can reach. Project editors can connect a store, and you can disconnect it later.
</Update>

<Update label="Jul 25, 2026">
  ### Leaked API keys are revoked automatically

  If a workspace API key is committed to a public GitHub repository, Lovable now revokes it automatically. GitHub detects the key and notifies Lovable, and the key stops working right away. The person who created it, along with every workspace owner and admin, gets an email naming the key and linking to the GitHub alert. Every workspace API key is covered automatically, and there's nothing to set up. A revoked key cannot be restored, so create a new key to replace it. Revoked keys no longer appear in your list of access tokens, and these emails are always sent, regardless of your email preferences.
</Update>

<Update label="Jul 24, 2026">
  ### Open projects in background tabs on desktop

  In [Lovable Desktop](/integrations/desktop-app), you can now Cmd or Ctrl+click (or middle-click) a project to open it in a background tab without losing your place, matching how browsers work. Cmd or Ctrl+Shift+click opens it in a focused tab instead. This ships in Desktop 1.4.0: new downloads include it, and existing installs update automatically.

  ### Report abuse and submit appeals with guided forms

  Trust and Safety requests now go through structured forms at [lovable.dev/abuse](https://lovable.dev/abuse) instead of emailing [abuse@lovable.dev](mailto:abuse@lovable.dev). You can file an abuse report, a website takedown appeal, a disabled account appeal, a DMCA takedown notice, a DMCA counter-notification, or a trademark complaint, and each submission includes a quick captcha step. Most forms are open to everyone, while website takedown appeals and DMCA counter-notifications ask you to sign in first.

  ### Editors can see build secret names

  Workspace editors can now see the names of your [build secrets](/features/build-secrets), read-only, so they can pick the right secret when attaching a private npm design system. Secret values stay hidden, and adding, editing, or deleting secrets stays limited to workspace admins and owners.
</Update>

<Update label="Jul 23, 2026">
  ### Let your app's users connect their own Notion

  [App user connectors](/integrations/app-user-connectors) now support Notion. Each person who uses your published app can connect their own Notion workspace, so the app reads and writes only the pages and databases that user shares, acting on their behalf. This is different from the standard Notion connector, where you connect one account once and every visitor shares it.

  As the builder, you set up one Notion OAuth client for your workspace under **Settings → Connectors → App user connectors**, using your own public Notion integration. Each user then signs in with their own Notion account the first time they use it.

  ### Payments is always visible in your project

  The [**Payments**](/features/payments) section now always appears under the **More** menu in your project for anyone with edit access, even when payments are not set up yet. If the Stripe and Paddle connectors are turned off for your workspace, or you do not have permission to manage payments, the payments view explains why and points you to the next step, such as asking a workspace admin to enable a connector or a project admin for access. Previously the section was hidden in these cases.

  ### Resubmit a declined Paddle checkout domain

  If Paddle flags an issue with your checkout domain during [payments](/features/payments) setup, the **Domain review** step now shows **Action required** with a **Resubmit for review** button, so you can fix the issue and resubmit the domain yourself instead of contacting support. This applies when Paddle is your active payments provider. Domains that Paddle fully rejects can still only be restored by Paddle support. Only people who manage payments on the project can resubmit.

  ### Recommended connectors in search

  When you search for a [connector](/integrations/introduction) in **Connectors**, Lovable now highlights a suggested option at the top of the results, marked with a **Recommended** badge. Recommendations point you to connectors that tend to work well for what you searched for, but you can still choose any connector from the list.
</Update>

<Update label="Jul 22, 2026">
  ### Gemini 3.6 Flash is now the default model for your app's AI

  Apps that call your built-in [AI features](/integrations/ai) without specifying a model now use **Gemini 3.6 Flash** (`google/gemini-3.6-flash`) by default, replacing the older Gemini 3 Flash Preview. Apps that already specify a model are unaffected, and no changes are needed on your side.

  ### Bulk-edit your Shopify catalog in one approval

  When you ask Lovable to create, update, or delete many [Shopify](/integrations/shopify) products or variants at once, it now handles the whole batch in a single approval instead of asking you to approve each product one at a time. If some items fail, Lovable reports which ones and retries only those. Just prompt Lovable to bulk-edit your catalog. Deleting products or variants is permanent, so review the batch before you approve it.

  ### Lovable MCP is now a Codex plugin

  The [Lovable MCP server](/integrations/lovable-mcp-server) is now a Codex plugin. If you use Codex, you can make changes to, create, and deploy your Lovable apps directly from Codex.
</Update>

<Update label="Jul 21, 2026">
  ### Invite people outside your workspace to an internally published app

  On the Business and Enterprise plans, the [publish](/features/publish) dialog has a new audience picker under **Who can see this website**. Alongside **Public** and your whole workspace, you can now choose **Custom** to compose the exact audience: workspace groups, individual members, and people outside your workspace by email. Project editors and above can set this.

  External invitees get an email with a link to the site. To view it, they sign in with the invited address, first creating a Lovable account with that email if they don't have one yet. Signing in gives them lasting viewer access, marked with an **EXT** label. Audience edits are saved as a draft first. When you publish your changes, Lovable sends the invite emails and updates who has access.

  Workspace admins and owners can turn off external invites for the whole workspace in [**Workspace settings → Privacy & security → External invites**](/features/privacy-and-security-settings#external-invites), and people already invited keep their access. [Workspace insights](/features/workspace-insights) flags internally published projects that have external viewers.

  ### Gemini 3.6 Flash for your app's AI features

  Your app's [AI features](/integrations/ai) can now use **Gemini 3.6 Flash** (`google/gemini-3.6-flash`), Google's latest generation Flash model for fast coding, reasoning, and agentic workflows. It accepts text, images, audio, and video as input and responds with text.

  ### App connectors: Apify and Tally

  [Apify](/integrations/apify) lets apps run web scraping and browser automation Actors, follow their runs, and read the scraped results. Use it for price monitors, lead scrapers, and research tools built on live web data.

  [Tally](/integrations/tally) lets apps create and update forms, fetch submissions, and manage webhooks for real-time submission workflows. Use it for feedback dashboards, lead capture flows, and internal tools built on Tally form data.

  Add it from **Connectors**, or ask Lovable in a project to connect it.
</Update>

<Update label="Jul 17, 2026">
  ### Redesigned workspace menu

  The workspace menu in the dashboard sidebar, opened by clicking your workspace name, has a cleaner layout that matches Lovable's current design. **Invite members** and **Settings** are now full-width buttons at the top and bottom of the menu. The list of workspaces is hidden when you only have one, and the whole menu is fully keyboard navigable and works the same on mobile.
</Update>

<Update label="Jul 16, 2026">
  ### Reuse your workspace identity in the apps you build

  Apps you build for your team can now [recognize the signed-in Lovable user automatically](/features/lovable-workspace-identity-reuse), with no login page and no second sign-in. Whoever is signed in to Lovable, through workspace SSO, Google, or email, is recognized by the app, so internal tools, admin dashboards, and workspace-only apps do not need to build their own login. Your app can read the current user's name, email, and Lovable user ID directly.

  This is available on the Business and Enterprise plans for newer projects on the TanStack Start stack, and it is rolling out gradually, so it may not be available for every workspace yet. It does not require workspace SSO to be configured. Workspace admins and owners control it from **Workspace settings → Privacy & security → App login methods**. To use it in a project, ask Lovable to reuse the signed-in user instead of adding a login page.

  ### Connect your app to Apollo.io

  You can now connect your Lovable app to [Apollo.io](/integrations/apollo) to search its B2B database of people and companies, enrich contact and organization data, and manage contacts, accounts, and deals. It fits prospecting dashboards, lead-enrichment forms, and internal sales tools built on live Apollo data. Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Choose which Wiz policies run during security scans

  If you use the [Wiz connector](/integrations/wiz) for security scanning, you can now choose which Wiz CI/CD policies run during a scan. Workspace admins and owners set a comma-separated list of policy names in the connector's **Advanced settings → CI/CD scan policies**. Leave it blank to keep running your Wiz tenant's default policies, as before. If a policy name is unknown, the scan now surfaces a visible **Wiz scan failed** finding in the project's **Security** view.
</Update>

<Update label="Jul 15, 2026">
  ### Let AI assistants use your published app

  Your published app can now be used by AI assistants such as ChatGPT and Claude, not just by people in a browser. With [agent integrations](/features/agent-integrations), Lovable turns your app's functionality into actions an assistant can call. If you built a booking app, for example, your users can connect it to their assistant and ask it to look up availability and book a time, and the assistant uses your app to do it.

  Enable it from **More → Agent integrations** in the editor by selecting **Enable agent integrations**, or ask Lovable to add agent integrations to your app. Lovable proposes the actions, you choose who can call them, and you get an MCP link that your users add to their AI assistant. Only publicly published apps are supported for now.

  ### Automatically delete abandoned projects

  Enterprise workspaces can now [clean up abandoned projects automatically](/features/privacy-and-security-settings#abandoned-projects), published and unpublished alike. Workspace admins and owners configure it under **Settings → Security → Privacy & security → Abandoned projects**: choose when a project counts as abandoned and how long after that it is deleted. Auto-delete is off by default. A project stays active while someone works on it in the editor, visitors use the published app, or its backend functions run; just opening or previewing it does not count.

  Before a project is deleted, its owner and members with edit access receive warning emails and see an in-project banner 5 days and 1 day ahead. Editing the project, sending it a message, or selecting **Keep it** cancels the deletion. Lovable keeps a deleted project for 60 days, and support can bring it back within that window.

  ### GPT-5.6 and Gemini text-to-speech models for your app's AI features

  Your app's [AI features](/integrations/ai) can now use OpenAI's GPT-5.6 preview models for chat and text:

  * **GPT-5.6 Sol** for the hardest reasoning and coding tasks
  * **GPT-5.6 Terra** for everyday work at lower cost
  * **GPT-5.6 Luna** for fast, high-volume tasks

  For voice features, Google's Gemini text-to-speech models are also available:

  * **Gemini 2.5 Flash TTS** for cost-effective speech
  * **Gemini 2.5 Pro TTS** for higher-fidelity voices
  * **Gemini 2.5 Flash Lite Preview TTS** for lightweight speech tasks, in preview
  * **Gemini 3.1 Flash TTS Preview** for the newest Gemini voices, in preview

  Ask Lovable to use any of these models in your app. Usage is billed per token, and you do not need your own OpenAI or Google API keys.

  ### Email alerts for sign-ins from a new device and country

  When someone signs in to your Lovable account from both a device and a country that have not been seen on your account before, you now receive a [sign-in alert email](/introduction/lovable-account-settings#sign-in-alerts). The email shows the country, the browser and operating system, the time, and the sign-in method that was used.

  If the sign-in was you, no action is needed. If you do not recognize it, follow the instructions in the email to reset your password and secure your account. These emails are always sent, regardless of your email preferences.

  ### Password reset is unavailable for accounts without a password

  If your account signs in only through Google, GitHub, Apple, or SSO, selecting **Forgot password?** no longer sends a password-reset email. You see a **Password reset unavailable** message instead. Sign in with the provider you used to create your account, and manage your password through that provider. See [Reset your password](/introduction/create-an-account#reset-your-password).
</Update>

<Update label="Jul 14, 2026">
  ### See images, videos, and files the agent works with in chat

  When the agent generates or refers to files, chat now shows them as thumbnails instead of a list of file paths. Ask something like "show me my images" and you get a gallery of clickable tiles right in the conversation.

  Images and videos appear as visual previews, and other file types like PDFs, documents, and audio appear as labeled tiles. Click a tile to open it: files stored in your project open in the [**Files** panel](/features/projects/editor#project-toolbar), and freshly generated images open in a preview. This works for files in the Files tab, images the agent just generated, and assets in your project's code.

  ### Emails and confirmations for workspace role and membership changes

  You now get email notifications when [membership changes](/features/people#manage-existing-members) in your workspace. When someone is made an admin or owner, the workspace's other admins and owners receive an email that names the person, their new role, and who made the change. When someone is removed from a workspace, that person receives an email.

  When you invite or promote someone to admin or owner, Lovable shows what the role includes: admins can manage workspace members, billing, integrations, and settings, and owners have full control of the workspace, including billing and managing other owners. Promoting an existing member to admin or owner also asks you to confirm first.

  ### The Lovable badge returns on your next publish after a downgrade

  Hiding the **Edit with Lovable** badge on your published site is a paid feature, available on the Pro, Business, and Enterprise plans. If your workspace moves to a plan that doesn't include it, the badge now comes back the next time you publish that project. Sites that are already live stay as they are until you republish them.

  ### Clearer visitor analytics toggle in project settings

  The analytics control in **Project settings → Publishing** is now labeled **Visitor analytics**, replacing the older **Disable analytics** toggle. Turn it on to collect visitor analytics for your published app, and turn it off to stop collecting. Your existing setting carries over, so nothing changes for your project.
</Update>

<Update label="Jul 13, 2026">
  ### Let your app's users connect their own accounts

  [App user connectors](/integrations/app-user-connectors) let each person who uses your published app connect their own third-party account, so your app acts on their behalf, with their own permissions and only their data. This is different from a standard app connector, where you connect one account once and every visitor shares it.

  Use it when your app is multi-tenant by nature: a signed-in user should see their own inbox, their own calendar, or their own CRM records. Supported providers include Google, Microsoft, Slack, Salesforce, HubSpot, Linear, Databricks, and Snowflake.

  As the builder, you configure a client once for your workspace, then each user signs in with their own account the first time they use it. Setting up a client follows the same access rules as other app connectors.

  ### Mapbox connector

  You can now connect your app to [Mapbox](/integrations/mapbox) to embed interactive maps with Mapbox GL JS, geocode addresses, and calculate routes and directions. Add it from **Connectors**, or ask Lovable in a project to connect it. Mapbox uses your own Mapbox access tokens, so Mapbox usage is billed to your Mapbox account.

  ### Connect KLIPY in one click, no API key

  The [KLIPY GIF connector](/integrations/klipy) now offers a **Managed by Lovable** authentication option: connect in one click, with no KLIPY account or API key. Lovable provisions and manages a workspace-level key for you. Under **Authentication**, select **Managed by Lovable**.

  You can create one managed KLIPY connection per workspace, and it is shared with the whole workspace by default. To limit who can use it, select **Restrict to specific people** under **Who can use this connection**. The **Use your own credentials** option remains available if you want to manage your own KLIPY account, content, and usage limits.

  ### Redesigned settings

  All workspace and project settings pages now use a consistent layout, with section cards, compact rows, and a refreshed sidebar with new icons. As part of the redesign, two sidebar sections were renamed: **Members & access** is now **Access**, and **Security & compliance** is now **Security**. Everything stays under **Settings**.

  [Groups](/features/groups) also open in a dedicated detail page now instead of expanding inline: select a group in **Settings → Groups** to search its member list, add or remove members, change group roles, or delete the group. Existing links to a specific group forward to the new page.

  ### Functions usage is now labeled Compute

  The [Cloud usage](/introduction/credits-and-usage#cloud-costs) category that was labeled **Functions** is now labeled **Compute**, which better reflects that it covers both the edge functions and the workers running your app. Find it under **Settings → Plans & credit usage → Usage details**. This is a labeling change only, so what counts toward the category has not changed.

  ### Collapse and expand the code file tree

  In the [Code view](/features/code-mode), you can now collapse or expand all folders in the file tree at once with new controls next to the search box, which makes it easier to get an overview of a large project.
</Update>

<Update label="Jul 10, 2026">
  ### Sign in to Lovable from your identity provider's portal

  Members of Business and Enterprise workspaces that use [SAML single sign-on](/features/business/sso) can now sign in by clicking the Lovable tile in their identity provider's app portal, such as Okta or Microsoft Entra, instead of starting at lovable.dev.

  Workspace admins and owners turn this on in the SAML provider setup under **Settings → Members & access → Identity**. The setup wizard now shows a dedicated IdP-initiated ACS URL to add to your identity provider, along with its requirements. Group restrictions are enforced the same way as standard SSO sign-in.

  IdP-initiated sign-in works only while your workspace is the only one that has verified your email domain, and it turns off automatically if another workspace verifies the same domain. The SAML response must be signed and scoped to the SP Entity ID.

  ### See project status in your browser tab

  The browser tab for a project now shows a status badge on its icon, so you can tell what Lovable is doing without switching back to it. The badge appears while Lovable is building, changes when Lovable needs you to approve an action, and clears when the work is done.
</Update>

<Update label="Jul 9, 2026">
  ### App connectors: dbt Semantic Layer and ClickHouse

  [dbt Semantic Layer](/integrations/dbt-semantic-layer) lets apps query governed metrics from your dbt Cloud Semantic Layer, sliced by dimension and time grain, without writing warehouse SQL. Use it for internal dashboards, customer-facing analytics, and AI features that answer with the metric definitions your data team already maintains in dbt. The connector is read-only.

  [ClickHouse](/integrations/clickhouse) lets apps run SQL queries against a self-hosted or ClickHouse Cloud database over its HTTP interface. Use it for analytics dashboards, log and event explorers, and other apps built on top of your OLAP data.

  Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Connect BigQuery with your Google account

  You can now link the [BigQuery connector](/integrations/bigquery) by signing in with Google, without setting up Workload Identity Federation. Select **Connect with Google**, enter the Google Cloud project ID that queries should run in, and approve access. Queries run as your own Google account, and BigQuery usage is billed to your Google Cloud project.

  The **Use your own credentials** option remains available for connecting with a service account through Workload Identity Federation, which suits teams that do not want the connection tied to one person's Google account.

  ### Approve connector actions before they run

  When Lovable wants to use one of your [app connectors](/integrations/introduction) to make a change, such as sending a message or updating a record, it now pauses and [asks for your approval](/integrations/introduction#approving-connector-actions-in-the-project-chat) first. The approval card describes what Lovable wants to do and shows the request details. Read-only requests keep running without prompts.

  Select **Allow once** to approve a single action, **Always allow** to let future actions for that connection run without asking, or **Skip** to move on without running the action. The **Always allow** preference applies to you and that connection, and you can change it later from the connection's settings.

  ### Enterprise member profiles are now private by default

  Public Lovable profiles of Enterprise workspace members are now hidden by default. People outside the workspace can no longer open a member's public profile page, and public project pages no longer show the member's name and avatar as the publisher. Members of the same workspace still see each other's profiles.

  Workspace admins and owners can make member profiles public again with the [Public member profiles](/features/privacy-and-security-settings#public-member-profiles) setting in **Settings → Security & compliance → Privacy & security**.

  ### Workspace invitations expire after 30 days

  Unaccepted [workspace invitations](/features/people#invite-by-email) now expire 30 days after they are sent. An expired invitation disappears from the People tab and can no longer be used to join the workspace on any path, including the invitation email, invite links, domain auto-join, and SSO sign-in. Invitation emails now state the expiry date.

  To bring someone in after their invitation expires, invite them again: a new invitation starts a fresh 30-day window. This also applies to invitations that were already pending, so any invitation sent more than 30 days ago has expired.

  ### Improved image gallery in the Files tab

  The [Files tab's](/features/generate-files#manage-generated-files) grid view now shows images at their real proportions instead of cropping them to uniform squares, so a project's images are easier to scan.

  Each file also gets quick actions: hover an image and select **Reference** to add it as a reference in chat, or open the file actions menu to reference the file, download it, copy an image to your clipboard, or delete it. Deleting a file cannot be undone.
</Update>

<Update label="Jul 8, 2026">
  ### Search your settings

  You can now filter settings from a search box in the [settings sidebar](/features/workspace-admin-settings). Start typing in **Search settings** at the top of the sidebar to narrow the list to matching sections in both workspace settings and [project settings](/features/projects/settings).

  Search matches setting names and common synonyms, so typing `env` surfaces build secrets and `sso` surfaces identity settings. If nothing matches, you see **No matching settings**.

  ### Reference a connector in chat

  You can now reference an [app connector](/integrations/introduction) directly in a chat message. Type `@` in the chat input and pick an app connector from the list to insert it as a reference while you describe what you want to build. The picker shows popular app connectors by default and filters as you type.

  ### Pause a Lovable Cloud project

  You can now manually [pause a project's Lovable Cloud backend](/integrations/cloud#pause-cloud) so it stops using compute credits while you are not working on it. Open **Cloud tab → Overview → Advanced settings**, select **Pause**, and confirm the action.

  While paused, the project's database, authentication, storage, and edge functions are unavailable, so the live app stops working until you resume. Your data is preserved and pausing is fully reversible: select **Wake up** to bring the backend back online. Storage still counts toward usage while a project is paused.

  ### Resize your Cloud instance from chat

  You can now ask Lovable in chat to [resize your project's Lovable Cloud compute instance](/integrations/cloud#ask-lovable-to-resize-your-instance), instead of opening Advanced settings yourself. Describe the problem, such as a backend that is slow under load, and Lovable offers a size picker (Tiny through Large) with your current size preselected.

  Resizing changes the compute instance, its CPU and memory, not your database storage. A larger instance handles more traffic and heavier database work and increases your ongoing Cloud usage, and a smaller instance reduces it. Resizing takes a few minutes, during which the backend is briefly unavailable.

  Available on Pro, Business, and Enterprise plans, for Lovable Cloud projects, and requires permission to edit the project.

  ### Configure SSO Just-in-Time provisioning from settings

  Workspace owners and admins on Enterprise plans can now turn [SSO Just-in-Time (JIT) provisioning](/features/workspace-identity#sso-sign-in) on or off themselves. Open **Settings → Members & access → Identity**, find **User provisioning**, and use the **SSO Just-in-Time provisioning** toggle under **SSO sign-in**.

  When it is on, people who sign in through your SSO provider for the first time are added to your workspace automatically, with the role you set on the provider. On Business plans, SSO sign-in provisioning turns on automatically once an SSO provider is configured, and its status is shown as read-only.

  ### Workspace insights now on Business plans

  Workspace admins and owners on Business plans can now use [Workspace insights](/features/workspace-insights) to review and govern every project in the workspace from one place, which was previously available only on Enterprise. Open it from **Settings → Security & compliance → Security center → Workspace insights**.

  You get the full project inventory with search, filters, and sorting, along with summary cards, CSV export, and the option to run a security scan. Detecting and scanning for personal identifiable information (PII) remains available only on Enterprise plans.

  ### Images Lovable generates are labeled as AI-generated

  Images that Lovable's AI generates or edits for your project now include standard provenance metadata (IPTC) that marks them as AI-generated. This covers images from the agent's image generation and editing, social preview images, and image variants created in the visual editor.

  Platforms and tools that read this metadata, such as Google and some social networks, can then label the images as AI-generated. This applies to newly generated images and does not change how images are generated or what they cost. Images your app generates through its own AI features are not affected.
</Update>

<Update label="Jul 7, 2026">
  ### Nano Banana 2 Lite image model for AI features in your app

  [Lovable AI gateway](/integrations/ai) now supports Nano Banana 2 Lite, Google's `gemini-3.1-flash-lite-image` model, for AI features inside your app.

  Use it as a faster, lower-cost option for image generation and editing workflows, such as drafts, thumbnails, visual variants, and editing tools.

  ### Restrict workspace access by SSO group

  Workspace owners and admins on Business and Enterprise plans can now map IdP groups to workspace roles for their [SSO provider](/features/business/sso).

  Open the provider from **Settings → Identity**, then use the **Groups** tab to map IdP groups to viewer, editor, or admin roles. When someone signs in through SSO, Lovable assigns the mapped role if their IdP group matches. Everyone else gets the default JIT role.

  Turn on **Group restriction** to limit access to mapped groups only. Anyone without a matching IdP group is blocked from signing in, so map every group that needs access before turning it on.

  ### Sign in with SSO using your company domain or provider ID

  Business and Enterprise users can now start [SSO sign-in](/features/business/sso) with a company domain or provider ID, instead of needing the workspace URL name.

  On the SSO login page, enter your company domain, such as `acme.com`, or your provider ID, such as `saml.okta-acme`. Lovable finds the matching SSO provider, and if more than one provider matches, you can choose which one to use.

  ### App connector: GitHub API

  [GitHub API](/integrations/github-api) lets the apps you build read repositories, track issues and pull requests, follow releases and workflow runs, and build automations around your engineering work. Use it for issue triage boards, PR status hubs, release trackers, repository health dashboards, contributor activity feeds, and internal tools powered by GitHub.

  Add it from Connectors, or ask Lovable in a project to connect it.

  <Note>
    This is separate from [GitHub Git sync](/integrations/github). Use the GitHub API connector when your app needs to work with GitHub data. Use GitHub Git sync when you want to export or sync your Lovable project’s code to a GitHub repository.
  </Note>

  ### Find in page, clipboard, and location in the desktop app

  The [Lovable desktop app](/integrations/desktop-app) now supports more browser behavior in app previews.

  Use **Cmd+F** on macOS or **Ctrl+F** on Windows to find text on the current page, then move through matches with **Cmd/Ctrl+G** and **Cmd/Ctrl+Shift+G**.

  Apps you preview can also copy to your clipboard, read from your clipboard after you allow access, and request your location. Lovable asks the first time an app tries to read your clipboard or use your location, with permissions scoped to that app.

  ### Search from the dashboard project tabs

  The [dashboard’s project tabs bar](/introduction/project-search-and-find#search-from-the-dashboard-project-tabs) now has a **Search** entry. Select it and the tabs turn into a search box that filters across all your project lists at once, so you do not have to switch tabs to find a project.

  Type to filter by a project’s name or owner, and select **X** or press **Escape** to close the search box.

  ### The last owner cannot leave a shared folder

  The only owner of a personal folder that is shared with others can no longer leave it. The **Leave folder** action is disabled with a note explaining why, so the folder is never left without an owner.

  ### Reorder folders shared with you

  You can now reorder personal folders that are shared with you by dragging them in the sidebar, alongside your own folders. Reordering only changes a shared folder's position at the same level, it does not move it into or out of another folder.
</Update>

<Update label="Jul 6, 2026">
  ### Lovable Desktop app is now on Windows

  The [Lovable desktop app](/integrations/desktop-app) is now available on Windows, alongside macOS. The desktop app includes the full web experience along with support for local MCP servers, multi-project tabs, and keyboard shortcuts.

  ### Recover access when an SSO provider is removed

  Members can now recover access from the login page if their workspace’s SSO provider is removed, without contacting an admin.

  On Business and Enterprise workspaces, the login page now detects when a member’s only sign-in method was deleted. If the workspace has a new SSO provider, they can sign in with it to reconnect their account. If no replacement provider is available, Lovable emails them a link to set a password instead.
</Update>

<Update label="Jul 3, 2026">
  ### Export or remove Lovable Cloud data

  If your app uses [Lovable Cloud](/integrations/cloud), you can now export your database and remove Lovable Cloud from a project, both from **Cloud tab → Overview → Advanced settings**. Available on all plans.

  * [**Export project data**](/integrations/cloud#export-lovable-cloud-data): download your database as an SQL dump. Select **Export data** to start the export, and Lovable emails you a download link when it is ready. Exports are limited to 5 GB, one per project every 24 hours. Storage files are downloaded separately from the **Storage** tab.
  * [**Remove Lovable Cloud**](/integrations/cloud#remove-lovable-cloud): permanently delete the project's Cloud-managed database, storage, authentication, and functions when you no longer need them. This cannot be undone, so export your data and download any storage files first.

  ### Workspace admins and owners can transfer projects again

  Workspace admins and owners on Enterprise plans can once again transfer projects to another workspace from the project menu, even when [Editor project transfers](/features/privacy-and-security-settings#editor-project-transfers) is disabled. This fixes a bug where that setting could incorrectly block admins and owners from transferring projects.

  Editors still need **Editor project transfers** turned on to transfer projects they own. The disabled **Transfer** button now also explains what is blocking the action.

  ### Queued messages no longer overlap

  Queued messages now stay aligned when you remove or reorder items while Lovable is working. This fixes a bug where deleting a message from the queue could leave the remaining messages visually overlapping.
</Update>

<Update label="Jul 2, 2026">
  ### Connectors page in projects

  Every project now has a [**Connectors**](/integrations/introduction) page where you can see the services connected to it in one place. Open it from **More → Connectors** in the project toolbar.

  It shows app connectors under **App connections**, and the MCP servers your project can access under **Chat connectors**. To browse the full catalog, select **All connectors**. You still manage each connection from its own connector page.

  ### App connector: WordPress (self-hosted)

  [WordPress (self-hosted)](/integrations/wordpress) lets apps work with content from WordPress sites you host yourself, separate from the WordPress.com connector for sites hosted on WordPress.com. Use it to build blogs, marketing sites, help centers, editorial dashboards, content workflows, and headless CMS experiences that pull from your WordPress posts, pages, custom post types, media, categories, tags, and user profiles.

  Add it from **Connectors**, or ask Lovable in a project to connect it.
</Update>

<Update label="Jul 1, 2026">
  ### Restrict who can download project code

  Enterprise workspaces can now control who can download project source code from Lovable.

  Workspace admins and owners can open **Settings → Security & compliance → Privacy & security** and disable [Code downloads](/features/privacy-and-security-settings#code-downloads). When code downloads are disabled, only workspace admins and owners can download a project’s source code as a zip file. Other members see the download option disabled.

  This only controls zip downloads from Lovable. It does not affect access to connected GitHub or GitLab repositories, or the ability to view code in the editor.
</Update>

<Update label="Jun 30, 2026">
  ### Project monitoring (Beta)

  [Project monitoring](/features/project-monitoring) is now in beta on Pro, Business, and Enterprise workspaces.

  Turn it on for a project to have Lovable check your app on a schedule, review your code, and look at recent visitor errors. When Lovable finds an important issue, project editors see the finding above chat, and the project owner gets an email for important or time-sensitive findings.

  Monitoring is opt-in per project, and any project editor can turn it on from [**Project settings**](/features/projects/settings#project-monitoring), choose a daily or weekly schedule, and set a minimum number of project edits before a check runs. Run history in project settings shows previous checks, results, and credit usage.

  ### Faster AI responses in your app with OpenAI priority processing

  You can now ask Lovable to make AI features in your app respond faster. When you ask for lower latency, Lovable can use [priority processing](/integrations/ai#faster-responses-with-priority-processing) for supported OpenAI chat models through the Lovable AI Gateway. Use it when speed matters, such as chat features, assistants, copilots, and other interactive AI experiences.
</Update>

<Update label="Jun 29, 2026">
  ### Set a default hosting region for new projects

  Workspace admins and owners on Business and Enterprise plans can now set a [default hosting region](/features/privacy-and-security-settings#default-hosting-region) for new Lovable Cloud projects.

  Set it from **Settings → Security & compliance → Privacy & security → Default hosting region**, and choose **Americas**, **Europe**, or **Asia Pacific**. When a default region is set, every new Cloud project in the workspace uses that region, and members cannot choose a different one when creating a project.

  The setting only applies to new projects. Existing projects keep the region they were created in, and are not migrated. Setting a default hosting region requires new projects to use a micro database instance or higher, which may use more credits.

  ### App connector: X

  [X](/integrations/x) (formerly Twitter) lets apps look up users, search recent public posts, and read public post details. Use it for social dashboards, profile lookups, keyword monitoring, social proof widgets, event hashtag trackers, influencer directories, and brand mention boards. The connector is read-only, so apps can fetch public X data but cannot post, like, follow, or send DMs.

  Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Fewer taps to attach images on mobile

  On the [Lovable mobile app](/integrations/lovable-mobile-app), attaching an image to a message now takes fewer taps. Tapping the add button opens your device's photo, camera, and file picker directly, instead of going through an extra menu first.
</Update>

<Update label="Jun 26, 2026">
  ### App connectors: KLIPY and Logo.dev

  [KLIPY](/integrations/klipy) lets apps search and embed GIFs, stickers, and short clips, generate AI emojis on demand, and add trending media pickers. Use it for chat, social, commenting, reactions, meme feeds, and custom emoji tools.

  [Logo.dev](/integrations/logo-dev) lets apps display company logos by domain, stock ticker, or crypto symbol. Use it for dashboards, directories, marketplaces, CRM views, profile cards, and company search experiences.

  Add it from **Connectors**, or ask Lovable in a project to connect it.

  ### Comments in shared app previews

  People with a preview link can now leave comments directly on the app preview, even without a Lovable account.

  Guest comments are on by default for [shared preview links](/features/share-project#share-preview-links), and you can turn them off from the **Share** dialog. Guests can click **Comment** in the [preview toolbar](/features/preview-toolbar), click anywhere on the preview to pin feedback, and follow the conversation in the comments panel alongside the preview.

  ### Paste an API key in chat and Lovable saves it as a secret

  You can now paste an API key or token into chat and Lovable will save it as a project secret automatically.

  When Lovable detects a key, it replaces the value with a labeled tag, such as `OPENAI_API_KEY`, before you send the message. The real value stays out of the message and chat history, while the agent can still use the secret by name when helping you build.

  ### 8-hour session option for enforced SSO

  Workspace admins and owners on Business and Enterprise plans can now set enforced SSO sessions to expire after 8 hours.

  The new option sits alongside the existing 24-hour, 48-hour, and 7-day durations. Members who [sign in with SSO](/features/business/sso) are asked to re-authenticate after the selected period. Set it from **Enforce SSO** in your workspace identity settings.

  ### Search the template and design system pickers

  When you start a project from a template or attach a design system, the picker now has a search box. Type to filter the list by name instead of scrolling, and clear the search to see everything again.
</Update>

<Update label="Jun 25, 2026">
  ### Let Lovable debug and improve your app's AI features

  Lovable can now use your app's [AI activity](/integrations/ai#monitor-ai-usage-and-activity) to help debug failing requests, improve prompts, and reduce cost and latency.

  When you ask for help, Lovable can see request summaries from the **Cloud → AI** tab, including status, model, token usage, cost, and duration. To let Lovable inspect the full request and response, turn on **AI app context** in [project settings](/features/projects/settings#publishing).

  ### Detach a design system from a project

  Enterprise workspaces can now detach a [design system](/features/design-systems) from a project. Open the project's design system settings, then select **Remove**. The design system's files stay in your project under `src/design-system` as regular code you can edit, but the project stops receiving updates from the design system. Detaching is permanent: to reconnect, you attach the design system again from scratch.

  ### Keep collaborators when you transfer a project to another workspace

  You can now choose whether to keep project collaborators when moving a project to another workspace.

  The **Transfer to workspace** dialog now includes a **Transfer project collaborators** checkbox. Leave it off to remove direct collaborators and pending invites from the project during the move. Turn it on to bring them along, as long as the destination workspace settings allow their role and you have permission to grant it.
</Update>

<Update label="Jun 24, 2026">
  ### Manage scheduled jobs in Lovable Cloud

  If your app uses Lovable Cloud, you can now manage scheduled jobs from the new [Jobs](/integrations/cloud#jobs) tab in your project's Cloud panel.

  Use it to see every scheduled job, its status, schedule, last run time, and run history. You can also enable or disable jobs without leaving the page. Creating jobs, changing schedules, and deleting jobs still happens in SQL or by asking Lovable.

  The *Jobs* view gives you a clearer way to understand what is running in the background, how often each job runs, and which jobs may be driving credit usage.

  ### App connector: Calendly

  [Calendly](/integrations/calendly) lets your apps build booking and scheduling flows using Calendly account data. Apps can read the connected user and organization profile, list event types and scheduled events, fetch invitee details, create single-use scheduling links, and cancel scheduled events on behalf of the connected user.

  Add it from *Connectors → App connectors*, or ask Lovable in a project to connect it.

  ### Lovable MCP updates

  The [Lovable MCP server](/integrations/lovable-mcp-server) is now listed in the Azure API Center directory, making it easier for enterprise teams to discover and connect Lovable from Microsoft tools like Copilot Studio and Azure AI Foundry.

  ### Cleaner preview error messages

  Preview error messages now have a cleaner, more consistent design and behavior, making them easier to understand and act on when something goes wrong.
</Update>

<Update label="Jun 23, 2026">
  ### Workspace insights for Enterprise governance

  Workspace admins and owners on Enterprise plans can now use [Workspace insights](/features/workspace-insights) to review and govern every project in the workspace from one place. Open it from *Settings → Security & compliance → Security center → Workspace insights*.

  Workspace insights brings together security findings, PII findings, ownership, lifecycle, cost, publish status, and activity across projects, then gives each project a review priority of *High*, *Medium*, *Low*, or *Not scanned* so the projects that need attention rise to the top.

  ### Restrict external collaborators without enforcing SSO

  Workspace admins and owners on Business and Enterprise plans can now limit how much access [external project collaborators](/features/privacy-and-security-settings#external-project-collaborators) can have, without enforcing SSO. Previously, this control was only available for workspaces with SSO enforcement turned on.

  Open *Settings → Privacy & security* and set *External project collaborators* to the highest project role someone outside the workspace can have: *Allow all*, *Allow editors and viewers*, *Allow viewers*, or *None allowed*.

  ### Set up Okta SSO and SCIM from the Okta app catalog

  Lovable is now a verified app in the Okta Integration Network. Workspace admins and owners can search for Lovable in their Okta app catalog and set up [single sign-on](/features/business/sso) and [SCIM provisioning](/features/business/scim) through a guided, pre-built flow, instead of copying metadata, ACS URLs, and SCIM endpoints by hand.

  ### A more compact Show toolbar button

  When you hide the [preview toolbar](/features/preview-toolbar), the control to bring it back is now an icon-only button instead of a labeled one, freeing up horizontal space in the project toolbar. You can find it at the top of the preview, next to *Share* and *Publish*.
</Update>

<Update label="Jun 22, 2026">
  ### Better standard image generation while building

  Lovable now uses GPT Image 2 for standard-quality image generation when creating image assets for your app, with better results for text, fine details, and polished visuals.

  ### Browser testing is more integrated

  [Browser testing](/features/browser-testing) now runs more directly as part of Lovable’s regular app-building flow, making it easier to test changes against your live preview before confirming they work.

  ### Lovable MCP updates

  The [Lovable Model Context Protocol (MCP) server](/integrations/lovable-mcp-server) now connects natively to Cursor and is listed in the GitHub MCP directory, making it easier to build from Cursor, Visual Studio Code, and other supported tools.

  ### Aikido penetration testing is now available on all plans

  [Aikido penetration testing](/integrations/aikido) is now available on all Lovable plans.

  Use Aikido to run AI-powered penetration testing, identify exploitable vulnerabilities through dynamic testing, sync findings into your project’s Security view, and generate downloadable reports for security reviews, compliance workflows, and stakeholder communication.

  ### Verified-domain teammates now join projects with the right workspace role

  On Business and Enterprise workspaces with verified-email JIT provisioning enabled, project invites now add verified-domain teammates with the workspace’s default provisioning role and no longer treat them as external collaborators. Existing verified-domain collaborators are updated the next time they are invited to a project.

  ### Filter audit logs by restricted projects

  Enterprise workspace admins and owners can now use the *Resources* filter in *Settings → Audit logs* to find any project in the workspace, including restricted projects they are not a member of. The picker also shows each project’s owner, making it easier to review activity across the whole workspace.

  ### TanStack Start is now the default for Enterprise apps

  New Enterprise apps now use TanStack Start with server-side rendering by default, matching the default stack used for other new Lovable apps.
</Update>

<Update label="Jun 18, 2026">
  ### One credit balance and clearer usage insights

  Lovable now uses one credit balance for building your app, hosting and running it with Lovable Cloud, and AI features your deployed app uses.

  Go to *Settings → Plans & credit usage* to see your balance, manage one-time top-ups and auto top-up, review included grants, and understand where credits are spent. Build credits continue to work as before. Cloud and AI usage now use credits instead of separate dollar balances, and any remaining Cloud or AI balance was converted into credits at your plan’s credit rate. Cloud and AI costs have not changed.

  The old Cloud and AI balance tab, Cloud and AI specific top-ups, and dollar-based auto top-up have been replaced by credit-based controls in *Plans & credit usage*.

  Use the credit balance view to see your credit types, expiry dates, and recent credit activity. Open *Usage details* to see *Build credits* and *Run credits* by time range, project, person, and group, depending on your plan and role. Build credits show credits spent planning, generating, editing, and updating apps. Run credits show Lovable Cloud and Lovable AI gateway usage together, including Cloud usage by Database, Network, Storage, Functions, and Realtime, and Lovable AI Gateway usage by the top three models using credits.

  Learn more in [Credits and usage](/introduction/credits-and-usage).

  ### Ask Lovable about your workspace’s credit usage

  You can now ask Lovable about your workspace’s [credit usage](/introduction/credits-and-usage) directly in chat.

  Ask a question about credits, spend, or cost, and Lovable looks up your usage using the same numbers shown in *Settings → Plans & credit usage*. Try prompts like *How many credits did this workspace use this month?*, *How many credits have I used?*, *Which project used the most Run credits?*, *Which Lovable AI Gateway model is using the most credits?*, or *Which Lovable Cloud category is driving usage?*

  Usage answers follow the same visibility rules as *Usage details*, so Lovable only shows the usage data your role is allowed to see.

  ### Add voice to your app with text-to-speech and speech-to-text

  [Lovable AI gateway](/integrations/ai) can now turn text into spoken audio and transcribe audio into text, so you can build voice features into your apps without a separate voice provider or API key. Describe what you want, and Lovable wires up the backend and picks the right model.

  Use [text-to-speech](/integrations/ai#text-to-speech-models) to read articles aloud, narrate AI-generated stories, or build a voice assistant that talks back. Use [speech-to-text](/integrations/ai#speech-to-text-models) to add dictation, transcribe voice notes, or turn a meeting recording into notes and action items. You can combine both to build two-way voice experiences like assistants and translators.

  ### Inspect your app's AI activity

  Every project now has an [AI activity dashboard](/integrations/ai#monitor-ai-usage-and-activity) under *Cloud → AI* that shows what your app's built-in AI features cost and how they are performing. Use it to track spend, spot failed requests, and inspect individual AI calls.

  Each request shows its status, the model used, the input and output tokens, the credits it cost, and how long it took. Turn on *Capture request details* to store the redacted request and response for each call, so you can open one and see exactly what was sent and returned. Secrets are removed before storage, and captured details are kept for 90 days.

  AI activity is available on all plans. Free workspaces can view the last 24 hours; paid plans can view the last 90 days.

  ### Publish and install private npm packages

  Enterprise workspaces can now host a [managed registry](/features/managed-registry) inside Lovable. You can publish internal packages, like a shared design system or utility library, without making them public, and install them in any project in your workspace.

  Workspace owners and admins set it up from *Settings → Build & deploy → Managed registry* by selecting *Provision registry* and creating a service account key. Any workspace editor can then view the published packages.

  ### Require the workspace editor role to edit projects

  Enterprise workspace admins and owners can now require that only members with the workspace editor role or higher can edit projects. Turn on [*Require workspace editor role*](/features/privacy-and-security-settings#require-workspace-editor-role) in *Settings → Privacy & security*.

  When it is on, workspace viewers and external collaborators can still view projects but cannot edit them, even if they own a project or were given editor access to it directly, through a folder, or through a group. The setting is off by default.

  ### Change nameservers for a domain bought through Lovable

  If you bought a domain through Lovable, you can now [point it at your own custom nameservers](/features/custom-domain#change-nameservers-for-a-domain-bought-through-lovable), for example Cloudflare, instead of letting Lovable manage its DNS. Workspace admins and owners can change nameservers from *Workspace settings → Workspace domains* by selecting *Configure* next to a domain and editing the *Nameservers* section. Select *Reset to Lovable* to hand DNS back to Lovable.

  When you switch to custom nameservers, Lovable stops managing the domain's DNS, so any connected site and its email stay offline until you recreate the records at your provider.

  ### Clearer personal folder access management

  On Business and Enterprise plans, managing who can access a [personal folder](/introduction/project-folders#personal-folders) is now clearer. The option to share a folder is labeled *Manage access*, and new tooltips explain how folder access works, including how the projects inside a folder inherit access and which roles you can grant.
</Update>

<Update label="Jun 17, 2026">
  ### LinkedIn skills

  If your projects qualify you for a [LinkedIn skill](/introduction/lovable-account-settings#linkedin-skills-beta) based on how you use Lovable, you can now show it on your LinkedIn profile from *Settings → Your account*.

  Your skill appears on LinkedIn under *Connected apps*, in the Lovable app's details, describing what you build. You can show one skill at a time. You can disconnect at any time to remove it.

  This replaces the previous *Vibe coding level*, which LinkedIn no longer supports.

  ### Choose your interface language

  You can now choose the language Lovable uses in *Settings → Your account → Language*. Your choice is saved to your [account](/introduction/lovable-account-settings) and applied automatically when you sign in on any device.

  Lovable is currently available in 11 languages: English, French, German, Spanish, Portuguese (Brazil), Italian, Hindi, Indonesian, Japanese, Korean, and Thai. Not every part of Lovable is translated yet.

  ### App connector: Lightspeed

  [Lightspeed](/integrations/lightspeed) lets your apps work with Lightspeed Retail (X-Series) store data, including products, inventory, outlets, registers, customers, and sales. Add it from *Connectors → App connectors*, or ask Lovable in a project to connect it. Use it for retail dashboards, inventory tools, and store reporting.

  ### Build in Lovable from Claude

  The [Lovable MCP server](/integrations/lovable-mcp-server) now connects natively to Claude, so you can build, ship, and manage Lovable projects without leaving Claude's products.

  ### A refreshed color palette

  Lovable's interface now uses a new color system for a cleaner, more consistent look and improved readability.
</Update>

<Update label="Jun 16, 2026">
  ### App connectors: Chargebee, GatewayAPI, Lexware, Pipedrive, PrestaShop, Sevdesk, Wave, Wix, WooCommerce, Zoho Books, and Zoho CRM

  Eleven new app connectors let your apps work with more CRM, accounting, e-commerce, billing, and messaging services. Add them from *Connectors → App connectors*, or ask Lovable in a project to connect one.

  * [Chargebee](/integrations/chargebee) lets apps manage customers, subscriptions, invoices, checkout, and billing workflows.
  * [GatewayAPI](/integrations/gatewayapi) lets apps send SMS and RCS messages, track delivery, and handle inbound messages.
  * [Lexware](/integrations/lexware) lets apps work with contacts, invoices, quotations, vouchers, and accounting data.
  * [Pipedrive](/integrations/pipedrive) lets apps manage deals, people, organizations, activities, leads, and pipelines.
  * [PrestaShop](/integrations/prestashop) lets apps read and manage catalog, order, customer, and inventory data.
  * [Sevdesk](/integrations/sevdesk) lets apps manage contacts, invoices, orders, vouchers, and bookkeeping workflows.
  * [Wave](/integrations/wave) lets apps manage customers, products, invoices, estimates, vendors, and accounting data.
  * [Wix](/integrations/wix) lets apps work with Wix sites, e-commerce, bookings, CRM, CMS, and business resources.
  * [WooCommerce](/integrations/woocommerce) lets apps manage products, orders, customers, coupons, and store data.
  * [Zoho Books](/integrations/zoho-books) lets apps manage customers, invoices, bills, expenses, projects, and accounting records.
  * [Zoho CRM](/integrations/zoho-crm) lets apps read, search, create, and update leads, contacts, accounts, and deals.

  ### Cleaner preview links

  Preview links are now shorter and easier to share. When you copy a link from [Share preview](/features/share-project#share-preview-links), Lovable gives you a short `lovable.dev/preview/…` link instead of a long URL with the access token in it.

  Preview links are public, view-only links that anyone can open without logging in. Links are valid for 7 days, so you can share work in progress with clients, teammates, social posts, or bug reports without giving access to the project or publishing the app.

  ### Reference web pages in a "Build with URL" link

  [Build with URL](/integrations/build-with-url) links can now reference public web pages, not just images. Add an `html=` URL and Lovable uses the page as a reference for layout, content, and styling, so you can recreate or iterate on an existing page from a single link.

  Create links manually or with the [Link Generator](https://lovable.dev/links). Each link supports up to 10 references total, combining images and web pages. Referenced pages must be publicly reachable.

  ### See when you have unpublished changes

  The **Publish** button in the editor now shows a small dot when your project has changes that are newer than the live version. It gives you a quick visual cue that there is something new to [publish](/features/publish), without opening the publish dialog.

  The dot clears once you publish. It stays hidden when there is nothing new to publish, and when you do not have permission to publish.
</Update>

<Update label="Jun 15, 2026">
  ### App connectors: AWS Athena and Replicate

  Two new app connectors let your apps query data in Amazon S3 with SQL and run open-source AI models for image, video, audio, and text generation. Workspace admins and owners can configure them from *Connectors → App connectors.*

  [AWS Athena](/integrations/aws-athena) lets apps browse databases and table schemas, run SQL queries against data in Amazon S3, and fetch results without moving your data. Use it for dashboards, reports, internal tools, data explorers, and analytics workflows.

  [Replicate](/integrations/replicate) lets apps run thousands of open-source AI models, including models for image generation, video generation, audio, transcription, upscaling, background removal, and text generation. Use it for creative tools, media workflows, AI-powered editing, transcription, model playgrounds, and apps powered by your own fine-tuned models.

  ### Clearer inbox notifications

  Your [inbox](/introduction/dashboard-overview#inbox-tab) is now easier to scan. Each notification now shows an icon for its type, such as comments, collaboration, usage alerts, billing, and email, and notifications from another person show that person's avatar.

  The action button is now specific to the notification: a comment shows *View comment* and a billing notification shows *View credits*. The unread dot has also moved to the edge of each icon, so it no longer interrupts the notification text.
</Update>

<Update label="Jun 10, 2026">
  ### Preview toolbar

  The new [preview toolbar](/features/preview-toolbar) replaces Visual edits with a faster way to edit your app directly from the preview. Instead of opening a separate editing panel, pick a mode on the toolbar and point at what you want to change:

  * **Select elements** to click one or more parts of your app, attach them to chat as context, and describe the change you want.
  * **Edit text inline** to fix copy directly on the page, without writing a prompt.
  * **Draw annotation** to sketch on the preview and send the drawing with your message.
  * **Add a comment** to pin feedback to a specific element, so you and your collaborators can discuss changes in context.

  The toolbar appears as soon as the preview loads, docked at the bottom center. You can drag it anywhere, minimize it to an edge tab, hide it, bring it back from the project toolbar options, and choose Auto, Light, or Dark theme.

  You can also queue up your next change while Lovable is still working on the previous one, so small edits feel faster and more continuous.

  ### User insights for workspace members

  Workspace admins and owners can now click a member in *Settings → People* to open a [User insights](/features/people#user-insights) profile.

  The profile shows the member’s identity and role, credit usage over the last 7 and 30 days, projects they created, and projects they collaborate on, including pending project invitations. Project lists can be sorted by latest edit or highest usage.

  On Enterprise workspaces with audit logs, User insights also includes an Activity tab with the member’s recent workspace actions.

  ### Reference exact lines of code in chat

  You can now point Lovable at an exact line of code instead of referencing a whole file.

  Hover over a line number in the [code editor](/features/code-mode) and click the **+** chip to add a reference like `Button.tsx:42` to chat. Drag the chip to reference a range of lines, or use **Cmd/Ctrl+Shift+L** to insert a reference for the line or selection at your cursor.

  Line references appear as pills in your message. Click a pill in the chat input or in a sent message to jump the code editor back to that exact line.

  ### Find and fix database performance problems

  Lovable can now [investigate the slowest database queries](/integrations/cloud#find-and-fix-database-performance-problems) in your app’s backend.

  When you tell Lovable that your app or database feels slow, it can read PostgreSQL query statistics and rank the heaviest queries by total execution time, including call counts and timing data. Lovable can then inspect query plans and add targeted indexes where they help and help fix real bottlenecks before you consider upgrading compute.
</Update>

<Update label="Jun 9, 2026">
  ### Workspace view-only sharing

  Business and Enterprise workspaces can now share a project with everyone in the workspace as read-only.

  From the [Share](/features/share-project) dialog, choose your workspace as the audience, then set the permission to *Can view*. Workspace members can open and reference the project without being able to edit it, which makes it easier to share examples, hand off context, or showcase work without risking accidental changes.

  ### Publish from chat

  The agent can now [publish your app](/features/publish) for you while respecting all publish-related workspace settings and permissions.

  Ask Lovable to publish, deploy, ship, or go live, and the agent will check your publish settings, confirm required page information, run the same security checks used by the publish flow, and schedule the deploy. You can also ask for a specific Lovable subdomain, such as `my-todos.lovable.app`.

  Lovable asks for approval before publishing unless you have set the tool to auto-approve. For related settings, such as changing visibility, connecting a custom domain, or unpublishing, it points you to the right place in the UI.

  ### SVG previews in chat

  SVG attachments now render correctly when opened from the full-screen attachment viewer. Previously, SVG files could appear blank or broken.
</Update>

<Update label="Jun 8, 2026">
  ### Transfer a domain to Lovable

  Workspace admins and owners on paid plans can now [transfer domains](/features/transfer-domain) from another registrar into Lovable, so renewals, DNS records, registration details, and connected projects can all live in one place.

  Start from *Workspace settings → Workspace domains → Transfer in*. Lovable checks whether the domain is eligible, guides you through the required transfer details, and lets you choose which detected DNS records to carry over.

  Transfers from another registrar usually take 5 to 7 days. Your domain keeps working through your current provider while the transfer is in progress. Once the transfer completes, Lovable becomes the registrar, applies the DNS records you selected, and reconnects existing Lovable projects that were already using subdomains of the transferred domain.

  ### Markdown preview in the code editor

  Markdown files now have a preview toggle in the [code editor](/features/code-mode). Open a `.md` or `.markdown` file, then click the eye icon in the code editor toolbar to switch between the raw source and a rendered preview.

  This makes it easier to read READMEs, docs, and other Markdown files as formatted text without leaving the code editor. The preview supports common Markdown formatting, including tables, task lists, links, and code blocks.
</Update>

<Update label="Jun 5, 2026">
  ### Toggle WHOIS privacy after purchase

  [WHOIS privacy](/features/custom-domain) is enabled by default when you register a domain through Lovable, for TLDs that support it. You can now disable or re-enable it after purchase. Go to *Workspace settings → Workspace domains*, click *Configure* next to the domain, open the three dots menu in the upper right corner, and toggle *WHOIS privacy*.
</Update>

<Update label="Jun 4, 2026">
  ### Buy a domain without connecting it to a project

  You can now [purchase a domain](/features/custom-domain#buy-without-connecting-to-a-project) through *Workspace settings → Workspace domains* and leave the project connection step empty. The domain is registered to your workspace and can be connected to any project later from workspace or project domain settings.

  ### Transfer a domain out to another registrar

  You can now [transfer domains](/features/custom-domain) registered through Lovable to another registrar. From *Workspace settings → Workspace domains*, click *Configure* next to the domain, open the three dots menu in the upper right corner, and select *Transfer out*. Turn off the transfer lock, then reveal the EPP authorization code to provide to your new registrar. Lovable tracks the transfer status and automatically disconnects the domain from any connected projects when the transfer completes.

  New domains are locked for 60 days from registration, as required by ICANN; the exact unlock date is shown in the dialog.
</Update>

<Update label="Jun 3, 2026">
  ### Lovable MCP server now available on all plans

  The [Lovable MCP server](/integrations/lovable-mcp-server) at `mcp.lovable.dev` is now available on all plans, including Free.

  Connect any supported AI client (ChatGPT, Claude, Claude Code, Cursor, or VS Code) to create, edit, deploy, and manage Lovable projects through natural language.

  Free and Pro workspaces have third-party MCP client access on by default. On Business and Enterprise workspaces, admins and owners can configure it in *Settings → Privacy & security → Third-party MCP clients*: it is enabled by default on Business and disabled by default on Enterprise.

  ### Configure who can create app connector connections

  On Free and Pro plans, any workspace member with the editor role or higher can create [app connector](/integrations/introduction#who-can-create-connections) connections.

  On Business and Enterprise plans, workspace admins and owners can now choose one of three states for each connector from *Connectors → Admin settings → App connectors*:

  * *Disabled*: the connector is unavailable and no one in the workspace can create new connections. (Enterprise plan default)
  * *Enabled for admins only*: the connector is available but only workspace admins can create new connections. (Business plan default)
  * *Enabled for editors and admins*: the connector is available and any workspace member with the editor role or higher can create new connections.

  ### Connector sidebar

  The [connectors](/integrations/introduction) page now has a sidebar for faster navigation and discovery. Connectors are grouped under categories, making it easier to browse by type. *Admin settings* have moved to the bottom of the sidebar, where they open a panel for managing app connector and chat connector access across the workspace.

  ### Smarter PWA support

  When you ask Lovable to make your app installable, work offline, or send push notifications, it now picks the right setup for the request instead of applying the full PWA stack every time.
</Update>

<Update label="Jun 2, 2026">
  ### Move projects to folders from chat

  You can now ask Lovable to list your [folders](/introduction/project-folders) or move a project into a personal or shared folder directly from chat. Try prompts like “show my folders” or “move this project to my Marketing folder.”

  Lovable finds the right folder, handles visibility changes between personal and shared folders, and files the project for you, so you can stay organized without leaving the editor.

  ### Cleaner project collaborator icons

  When a project has more active collaborators than fit cleanly in the top bar, the extras now collapse behind a single avatar. Click it to see the rest.
</Update>

<Update label="Jun 1, 2026">
  ### Security scan profiles

  Lovable now has two built-in security scan profiles: [Basic scan and Deep scan](/features/security).

  Basic scan checks row-level security (RLS) policies, database schema and access control, and dependency vulnerabilities. It runs automatically when you open the publish dialog, and you can also run it manually from the project *Security view*.

  Deep scan adds a broader agentic code review for access control issues, unprotected backend endpoints, exposed secrets, unsafe input handling, insecure storage settings, and project-specific issues from security memory. You can run it manually from the project *Security view*, workspace *Security center*, or publish dialog after Basic scan passes.

  When publishing, Lovable shows Basic scan findings in the [publish dialog](/features/publish) with a warning to review and fix them in the *Security view*. If Basic scan passes, you can optionally run a Deep scan before publishing.

  ### Automatic fixes for Basic scan findings

  Lovable can now [automatically fix eligible critical findings](/features/security#let-lovable-automatically-fix-eligible-findings) from Basic scan during regular agent work.

  When auto-fix is enabled, Lovable uses the latest error-level Basic scan findings as context in chat, then attempts to fix safe issues like row-level security (RLS) misconfigurations and database access patterns. Auto-fix does not apply to Deep scan findings.

  Configure workspace defaults from *Workspace settings → Privacy & security → Security automation → Auto-fix security issues*, or manage it per project from *Project settings → Auto-fix security issues*.

  ### Scheduled security scans (Enterprise)

  Workspace admins and owners on Enterprise plans can now [schedule Deep security scans](/features/security-center#schedule-security-scans-enterprise-only) to run automatically across selected projects from the workspace *Security center*.

  Each workspace can have one weekly or monthly schedule for published projects or all projects. You can also trigger the scheduled scan manually and view the last run status from the schedule settings. Scheduled scans consume 1 credit per included project each time they run.

  ### App connector: Salesforce

  The new [Salesforce](/integrations/salesforce) app connector lets your apps query and update CRM records from your Salesforce org, including Accounts, Contacts, Leads, Cases, Opportunities, and more. Workspace admins and owners can configure it from *Connectors → App connectors*, with support for production, Developer Edition, and sandbox organizations.

  Use it to build support case dashboards, account health trackers, lead pipeline views, contact directories, sales activity reports, and other internal tools that work with live Salesforce data.

  ### Improvements and bug fixes

  * **App login methods moved to *Privacy & security***. Workspace admins and owners on Business and Enterprise plans can manage the policy for blocking app sign-in providers from *Settings → Privacy & security → [App login methods](/features/privacy-and-security-settings#app-login-methods)*. Functionality is unchanged.
  * **SCIM badge in *Settings → People*.** Members provisioned through SCIM now show a small SCIM badge next to their name. Enterprise admins can quickly tell which seats are managed by their identity provider and which were invited manually, making access reviews and support escalations easier.
  * **Session-based SSO login**. Fixed a gap where users in single sign-on (SSO) enforced workspaces could still sign in with email and password, bypassing the identity provider. SSO sessions are now validated on every request, so deprovisioned users lose access immediately.
</Update>

<Update label="May 29, 2026">
  ### More consistent project action buttons

  Comment, share, and publish buttons now use matching styles, with refined avatars and a more polished layout.
</Update>

<Update label="May 28, 2026">
  ### App connectors: Algolia, LinkedIn, and Microsoft SharePoint

  Three new app connectors let your apps work directly with advanced search, LinkedIn posting workflows, and Microsoft SharePoint content. Workspace admins and owners can configure them from *Connectors → App connectors*.

  [Algolia](/integrations/algolia) lets apps add fast, typo-tolerant search, faceted filtering, indexing, ranking, recommendations, and search analytics. Use it for product search, marketplace listings, documentation search, directories, location finders, and search analytics dashboards.

  [LinkedIn](/integrations/linkedin) lets apps read basic profile details, read the connected member’s primary email address, and publish posts on their behalf. Use it for post schedulers, personal brand dashboards, event registration, sales workflows, and content publishing tools.

  [Microsoft SharePoint](/integrations/microsoft) lets apps build with SharePoint sites, lists, and document libraries. Use it to build apps that browse team resources, work with shared documents, read and write list items, and connect workflows to existing Microsoft 365 content.

  ### Improvements and bug fixes

  * **Asset storage.** Images, videos, and other large files used in your apps are now stored outside the project itself. This keeps projects smaller, faster, and easier to work with, especially when using GitHub.
  * **History panel with bookmarks.** The history panel now has separate tabs for history and bookmarks, making it easier to find past work and saved items. History also loads more reliably and better matches what you see in chat.
</Update>

<Update label="May 27, 2026">
  ### Subagents

  [Subagents](/features/subagents) help Lovable investigate complex tasks faster by splitting research, code exploration, and review into focused parallel work. Available to all users.

  When a request needs more context, Lovable can start temporary, read-only subagents to inspect your project, look up documentation, review work against your prompt, and return findings to the main agent. Subagents cannot edit, create, or delete files, and all project changes still come from the main Lovable agent.

  Lovable decides when to use subagents automatically. For larger investigations, you can mention subagents in your prompt to encourage Lovable to split the work.

  ### New OpenAI image models for AI features in your app

  Lovable’s [built-in AI connector](/integrations/ai) now supports two OpenAI image models for AI features inside your app:

  * GPT Image 2 (`openai/gpt-image-2`)
  * GPT Image 1 Mini (`openai/gpt-image-1-mini`)

  Use them to build image generation and editing workflows, such as product mockups, marketing visuals, thumbnails, drafts, and creative assets, directly inside your projects without managing provider API keys.

  ### Sensitive data scanning

  Enterprise workspaces can now enable [sensitive data scanning](/features/sensitive-data-scanning) to detect personally identifiable information (PII) across projects. Workspace admins and owners can turn on *Sensitive data scanning* from *Settings → Privacy & security*, configure *Chat send protection* for new messages and attached files, and enable *Block publishing with PII* to prevent projects with unresolved PII findings from being published.

  Anyone with project edit access can run on-demand scans from the project’s *Sensitive data* tab to check chat history, Lovable Cloud Database, and Lovable Cloud Storage. They can also review all findings, mark false positives, redact detected segments in chat messages, or delete files that contain PII.

  ### Faster app previews across regions

  We improved the infrastructure that serves customer apps, reducing latency for live previews across regions. Apps should now load faster and perform more consistently, especially for users farther from Europe.
</Update>

<Update label="May 26, 2026">
  ### Delete a workspace

  Workspace owners can now [delete a workspace](/introduction/delete-workspace) directly from *Settings → Workspace*.

  Deleted workspaces enter a 60-day grace period where Lovable support can restore them. Members lose access immediately, and any active subscription is scheduled to cancel at the end of the current billing period. After the grace period, Lovable permanently deletes the workspace and its associated content.

  Workspace deletion is available to workspace owners on Free, Pro, and Business plans. Enterprise customers should contact their Lovable account team to delete a workspace.

  ### Project toolbar navigation improvements

  The project toolbar now has a more polished view switcher, clearer active states, improved keyboard navigation, and a simplified *More* menu for project views like Analytics, Cloud, Security, and other sections.

  ### Removed

  * **Project view pins.** Project views can no longer be customized with pins. The toolbar now uses a fixed layout to keep navigation consistent.
</Update>

<Update label="May 25, 2026">
  ### Custom MCP servers available on all plans

  [Custom MCP servers](/integrations/mcp-servers#custom-mcp-servers) are now available on all plans, no paid plan required.

  Connect custom MCPs from *Connectors → Chat connectors*.

  ### Group members now show only active and pending users

  [Group](/features/groups) page and CSV exports now exclude deactivated users, include only active and pending members, and mark pending members with an `invited` badge.
</Update>

<Update label="May 24, 2026">
  ### Lovable Cloud database health check

  Troubleshoot database issues faster with an on-demand [database health check](/integrations/cloud#database-health-check) for your Lovable Cloud database, directly from chat.

  Ask Lovable to run a health check, and it returns a summary of your database’s current status, including connections, memory, disk usage, uptime, and more. Use it to understand whether slow queries or timeouts are caused by query performance, runaway connections, memory pressure, low disk space, or compute limits.

  Try prompting: `Run a health check on my Cloud database.`

  ### Auto-compress large images on upload

  Lovable now automatically compresses large images during upload when they exceed the size limit, helping them fit into your request while preserving quality. When compression is applied, Lovable shows an info tag so you can see what changed.

  If an image would need too much compression and quality would noticeably degrade, Lovable still rejects the upload with a clear message.
</Update>

<Update label="May 21, 2026">
  ### Branded app URLs

  Business and Enterprise workspaces can now publish apps under a shared [branded URL](/features/branded-workspace-urls) pattern instead of the default `your-app.lovable.app`. Workspace admins and owners configure a single workspace subdomain from *Workspace settings → Branded app URLs*. When enabled, every app in the workspace follows this format: `https://{app-name}.{workspace-subdomain}.lovable.app`

  Newly published apps use the branded URL once the subdomain is active. Apps published before enabling the feature keep their existing URLs until they are republished. Custom domains still take precedence when configured.

  ### App connectors: Google Maps Platform, Semrush, and TikTok

  Three new app connectors let your apps work directly with maps, search engine optimization (SEO) data, and TikTok creator data. Workspace admins and owners can configure them from *Connectors → App connectors*.

  [Google Maps Platform](/integrations/google-maps) supports geocoding, routes, places, embedded maps, address validation, weather, air quality, and other Google Maps Platform application programming interfaces (APIs). Choose *Managed by Lovable* for the fastest setup, or provide your own credentials when you need more control.

  [Semrush](/integrations/semrush) lets apps read keyword research, domain analytics, backlinks, paid search data, projects, and position tracking from a connected Semrush account. Use it for SEO dashboards, keyword tools, competitor tracking, backlink monitoring, and client-facing reports.

  [TikTok](/integrations/tiktok) lets apps read profile information, follower counts, like counts, video statistics, and published video metadata from a connected TikTok account. The connector is read-only and does not support publishing content to TikTok.

  ### Gemini 3.5 Flash for AI features in your app

  Lovable’s [built-in AI connector](/integrations/ai) now supports `google/gemini-3.5-flash` for AI features in your app. This efficient Gemini model provides fast coding, reasoning, and agentic workflows, so you can build more responsive AI-powered features directly inside your projects.

  ### Improvements and bug fixes

  * **Mobile sidebar search searches across all sections.** [Mobile app](/integrations/lovable-mobile-app) sidebar search now searches *Starred*, *Created by me*, *Shared with me*, and your workspace at the same time, with duplicate results removed and grouped under labeled sections.
  * **Transparent backgrounds in image editing.** Image editing now preserves transparency when you remove a background or edit an image that already has a transparent background.
  * **New comments panel.** The [project comments](/features/project-comments) sidebar now stays hidden when it is not in use, and comment pins only appear while you are in comment mode.
  * **Chat response tips.** Chat now shows brief contextual tips while the agent is processing a response, highlighting useful Lovable features.
  * **Settings sidebar reorganized.** Settings are now grouped under Account, Project, and Workspace, with [workspace settings](/features/workspace-admin-settings) divided into *Members & access*, *Customization*, *Build & deploy*, and *Security & compliance*.
  * **Lovable templates and workspace templates.** The dashboard now separates *Lovable templates* from [*Workspace templates*](/features/business/design-templates). Lovable templates are the curated templates provided by Lovable, while workspace templates are templates owned by your workspace.
  * **Static egress IPs for app connectors.** Outbound traffic from Lovable’s app connector gateway now uses a stable IP range, so partners and enterprise customers can allowlist Lovable connector traffic more easily.
  * **Plans, skills, and files on the activity card.** Plans, skills, and files now render inline on the agent activity card in chat using a single, consistent card pattern.
  * **Tooltips dismiss reliably.** Tooltips now dismiss correctly when you move the cursor away.
</Update>

<Update label="May 18, 2026">
  ### SEO and AI search

  <Frame>
    <img src="https://mintcdn.com/lovable-f9060f1e/gAmYgMmUnMkkL3hc/images/changelog-images/2026-may-18-seo-reviewl.png?fit=max&auto=format&n=gAmYgMmUnMkkL3hc&q=85&s=1b8f13db74615ab7060117919829d8d5" alt="2026-may-18-seo-reviewl" width="1848" height="1232" data-path="images/changelog-images/2026-may-18-seo-reviewl.png" />
  </Frame>

  Lovable now includes a dedicated [SEO and AI search](/features/seo-aeo) tab under *Services → SEO & AI search*.

  The new tab brings together:

  * **SEO and AI search review.** Run on-demand audits for sitemap, `robots.txt`, metadata, semantic HTML, content structure, alt text, canonical tags, indexing, accessibility, mobile usability, and performance.
  * **Speed and Lighthouse checks.** Performance, accessibility, mobile usability, and indexing checks from the previous standalone *Speed* tab now live directly inside the SEO and AI search review.
  * **Google Search Console (GSC) setup.** If the [Google Search Console connector](/integrations/google-search-console) is enabled in your workspace, the SEO and AI search review can detect missing GSC setup and guide you through connecting GSC, verifying your site, and submitting your sitemap directly from chat.
  * **Semrush-powered SEO research.** Use *Research SEO with Lovable* to research keywords, competitors, backlinks, rankings, and SEO strategy using live Semrush data.
  * **Custom domains.** Buy or connect a custom domain and build your search presence on a domain you control.

  Lovable surfaces clear recommendations and can apply most fixes in one click. Semrush-powered SEO research has no additional cost through November 30, 2026, and does not require a Semrush account.

  ### Design guidance

  <Frame>
    <img src="https://mintcdn.com/lovable-f9060f1e/gAmYgMmUnMkkL3hc/images/changelog-images/2026-may-18-design-guidance.png?fit=max&auto=format&n=gAmYgMmUnMkkL3hc&q=85&s=ac9279f29295f6156d108ec9082fcc71" alt="2026-may-18-design-guidance" width="1846" height="1234" data-path="images/changelog-images/2026-may-18-design-guidance.png" />
  </Frame>

  [Design guidance](/features/design-guidance) helps you shape the visual direction of your project before Lovable starts building. Available to all users.

  For visually open-ended prompts, Lovable can generate three lightweight **design directions** so you can compare different layouts, typography, colors, spacing, and overall visual tone before choosing one. Pick a direction, refine it, or ask for another set before Lovable starts building the full app.

  Lovable can also ask guided **design questions** when your prompt would benefit from clearer visual preferences. Choose typography, color palette, and layout direction, and Lovable turns your choices into a design brief for the build.

  Design guidance also works on existing projects. Ask for variations of a hero section, navbar, pricing card, footer, or another component to explore alternatives without restarting the project.

  ### Chat with Lovable in Telegram

  <Frame>
    <img src="https://mintcdn.com/lovable-f9060f1e/gAmYgMmUnMkkL3hc/images/changelog-images/2026-may-18-lovable-telegram-bot.png?fit=max&auto=format&n=gAmYgMmUnMkkL3hc&q=85&s=559f680beb47e1eb7ac638d68ad87783" alt="2026-may-18-lovable-telegram-bot" width="3840" height="2160" data-path="images/changelog-images/2026-may-18-lovable-telegram-bot.png" />
  </Frame>

  You can now [chat with Lovable directly from Telegram](/tips-tricks/lovable-telegram-bot). Message the Lovable bot to build new apps, update existing projects, fix bugs, make UI changes, publish projects, review edit history, query your project database with read-only SQL, and view analytics for published projects. You can also search code across workspace projects, copy assets between projects, and compare patterns across codebases.

  Connect from [**Devices and apps**](https://lovable.dev/settings/apps) (*Settings → Devices & apps*). Available on Free and Pro plans.

  <Note>
    This is for chatting with Lovable inside Telegram, not for adding Telegram messaging to your app.
  </Note>

  ### Lovable MCP server (research preview)

  The [Lovable Model Context Protocol (MCP) server](/integrations/lovable-mcp-server) is now available in research preview for Pro and Business plans at `https://mcp.lovable.dev`, letting external AI clients connect to Lovable and manage projects through natural language.

  Use Claude Desktop, Claude Code, Cursor, or other MCP-compatible tools to create projects, send messages to the Lovable agent, inspect files and diffs, enable Lovable Cloud, run SQL, query analytics, or deploy apps without leaving your AI client.

  ### Lovable mobile app

  The [Lovable mobile app](https://lovable.dev/blog/mobile-app) is now available globally on iOS and Android. Build and iterate on projects from your phone, send messages to the agent, review updates, and check analytics while away from your computer.

  ### Workspace skills

  You can now create reusable [skills](/features/skills) that teach Lovable how to handle recurring tasks across your workspace. A skill is a named markdown playbook with instructions for a specific workflow, such as a launch checklist, changelog draft, accessibility review, SEO audit, support reply, or quality assurance pass.

  Workspace admins and owners can create skills from chat, import a public GitHub repository with a `SKILL.md`, or upload a ZIP with a `SKILL.md`. Lovable can apply skills automatically when a request matches the skill description, or you can invoke one manually from the slash menu in chat.

  Skills are available to every project in the workspace by default, and workspace admins and owners can disable *Automatic use* for a skill so Lovable will not apply it on its own, while still letting workspace members invoke it manually.

  ### Wiz security scanning

  [Wiz security scanning](/integrations/wiz) is now available in Lovable. Wiz adds software composition analysis (SCA) for dependency vulnerabilities and static application security testing (SAST) for risky source-code patterns, hardcoded secrets, unsafe API usage, and other code-security issues. Wiz findings appear directly in the project *Security view* alongside Lovable's other scanners.

  Workspace admins and owners can connect Wiz from *Connectors → App connectors → Wiz*. Only one Wiz connection can be added per workspace.

  ### Improved GitHub integration

  Lovable's [GitHub integration](/integrations/github) now supports more hosting setups, clearer connection management, and better recovery when sync breaks.

  The update includes:

  * **GitHub Enterprise Cloud with data residency.** Enterprise teams can now connect Lovable to `*.ghe.com` instances.
  * **GitHub Enterprise Server.** Enterprise teams can now connect Lovable to self-hosted GitHub Enterprise Server by creating their own copy of the Lovable GitHub app.
  * **GitHub connection recovery.** Lovable now shows *Reconnect* prompts when it detects sync failures caused by suspended app installations, missing repository access, changed permissions, removed workspace connections, or app installation issues.
  * **Cleaner editor navigation.** The GitHub button has moved out of the editor top navigation. You can still access project GitHub settings from *Project settings → Git → GitHub* or the `+` (plus) menu in the chat input.

  ### App connectors: Airtable, Attention, Brevo, Google Search Console, Granola, Mailgun, Notion, Storyblok

  Your apps can now integrate with more services for content, communications, search visibility, customer conversations, and team workflows. These connectors expand what you can build in Lovable by letting your apps interact directly with external tools and data sources. Workspace admins and owners can configure app connectors in *Connectors → App connectors*.

  * [Airtable](/integrations/airtable) lets your apps use Airtable bases as a flexible backend for records, lists, dashboards, and operational workflows. Your apps can read, create, update, and delete records with filtering, sorting, and pagination.
  * [Attention](/integrations/attention) lets your apps work with customer conversation data, including transcripts, scorecards, conversation insights, and team data. This makes it easier to build sales dashboards, call review tools, workflow automations, and AI summaries powered by customer calls.
  * [Brevo](/integrations/brevo) lets your apps send transactional and marketing emails, manage contacts and lists, and trigger communication workflows through your Brevo account. Use it for onboarding sequences, newsletters, internal alerts, customer outreach, and multi-channel messaging where supported by your Brevo account.
  * [Google Search Console](/integrations/google-search-console) lets your apps verify domains, submit and manage sitemaps, inspect URLs, read search analytics, and build SEO dashboards or reporting tools. Lovable can also use the connector in chat to answer SEO questions using live Search Console data.
  * [Granola](/integrations/granola) lets your apps access AI-generated meeting notes, summaries, transcripts, decisions, and action items. Use it to build internal tools that search meeting context, retrieve decisions, generate follow-ups, or surface insights from past conversations.
  * [Mailgun](/integrations/mailgun) lets your apps send transactional email through your existing Mailgun account and verified sending domains. Use it for receipts, account lifecycle emails, form-to-email workflows, scheduled reports, alerts, and deliverability dashboards.
  * [Notion](/integrations/notion) lets your apps read and write pages, query databases, create pages, append blocks, and update database rows. Use it to build apps backed by Notion content, such as help centers, project dashboards, lead capture flows, blogs, status pages, and changelogs.
  * [Storyblok](/integrations/storyblok) lets your apps fetch editor-managed content from a headless content management system and visual page builder. Use it to build marketing sites, blogs, documentation, product directories, localized sites, and preview experiences powered by Storyblok stories, components, assets, and SEO metadata.

  ### Chat connectors: HeyGen

  HeyGen is now available as a prebuilt [chat connector](/integrations/mcp-servers). Connect HeyGen so the Lovable agent can use avatars, voices, and video generation tools while building. Use it to create apps and workflows for AI avatar videos, voiceovers, personalized onboarding, and media-rich demos without leaving Lovable.

  Configure it in *Connectors → Chat connectors*.

  ### Lovable AI models for app features

  New models and embedding support are now available in [Lovable AI](/integrations/ai) for AI features inside your apps.

  * **GPT 5.5 family.** `gpt-5.5` and `gpt-5.5-pro` are now available with context windows up to 1.05 million tokens and tiered pricing above 272,000 tokens. The Pro variant is suited for the most demanding reasoning tasks.
  * **GPT 5.4 family.** `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, and `gpt-5.4-pro` are now available with context windows up to 1.05 million tokens and tiered pricing above 272,000 tokens.
  * **Gemini 3.1 Flash Lite Preview.** The fastest and lowest-cost Gemini 3 option, designed for simple, high-throughput tasks with limited reasoning depth
  * [Embedding models](/integrations/ai#embedding-models). You can now generate text embeddings through Lovable AI to build semantic search, RAG pipelines, FAQ bots, and knowledge bases. Four models are available:
    * `google/gemini-embedding-001`
    * `openai/text-embedding-3-small`
    * `openai/text-embedding-3-large`
    * `google/gemini-embedding-2-preview`

  Describe what you want to build and Lovable sets up the full implementation. Lovable AI requires no provider API keys. Usage is billed based on the underlying model.

  ### TanStack Start is now the default for new apps

  New Lovable apps created from May 13, 2026 use TanStack Start with server-side rendering by default, except on Enterprise plans. This gives new apps crawlable HTML from the first request, improves search engine optimization (SEO), and provides a stronger foundation for server-side functionality.

  Older React + Vite apps use **on-request pre-rendering** for verified search and AI crawlers, such as Google, Bing, social preview bots, and AI engines like ChatGPT, Perplexity, Claude, and Gemini. Pre-rendering runs at request time, so dynamically loaded content is included in what crawlers receive.

  ### Database backup restoration

  You can now [restore a Lovable Cloud project database](/integrations/cloud#database) to any of its recent daily backups from *Cloud → Database → Backups*, without contacting support. Lovable rolls the database back (schema and data), and brings the project back online in a few minutes. Useful for accidental changes, broken migrations, or data issues. Restores are permanent and discard data changed after the chosen backup, so ask Lovable to test your app afterwards.

  ### Domain management updates

  [Custom domain](/features/custom-domain) setup and management is now clearer, more centralized, and easier to recover when something goes wrong.

  * **Buy domains from workspace settings.** You can now buy domains directly from *Workspace settings → Workspace domains*. Domains bought through Lovable belong to your workspace, not a single project, so admins and owners can manage them centrally and connect them to projects as needed.
  * **Move domains between workspaces.** Lovable-purchased domains can now be moved between workspaces, making it easier to reorganize projects, transfer ownership, or hand off domains between teams. The destination workspace must be on a Pro plan or above, and you must be an admin or owner of the destination workspace.
  * **Stalled SSL provisioning recovery.** If custom domain setup stalls during SSL certificate provisioning, a *Stalled* status and a *Retry* button now appear after 10 minutes. Click Retry to restart without removing and re-adding the domain.

  ### Draw on images

  You can now draw directly on uploaded images before sending them to the agent. Highlight the exact area, element, or detail you want Lovable to focus on. The annotated image is sent with your message, giving the agent clearer visual context without needing a long written explanation.

  ### Build and Plan mode switch

  The chat input now has a clearer dropdown for switching between [Build](/features/agent-mode) and [Plan](/features/plan-mode) modes. Build and Plan behavior is unchanged: Build makes changes directly, while Plan lets you discuss architecture, requirements, or design before anything is written. When Plan mode is active, the send button turns blue, and you can still switch modes with `⌥P`.

  ### Security memory

  Each project now has a dedicated [security memory document](/features/security-view#improve-scan-accuracy-with-security-memory) that the security scanner reads before each scan. Use it to describe your app’s access control model, business logic rules, and risks you have already reviewed and accepted, so future scans can stay focused on new or unresolved issues instead of re-flagging the same findings.

  The scanner can also update the memory when a risk is accepted during a scan, adding a short note for future runs. You can view and edit the document from the [Security view](/features/security-view) by clicking *Edit security memory*. Security memory replaces the previous *Add context* field that stored scan context in project *Knowledge*.

  ### Admin and security updates

  New visibility and management tools help workspace admins and owners on Business or Enterprise plans audit authentication, manage groups, and troubleshoot identity provisioning at scale.

  * [**Security center** auth provider filter](/features/security-center) (Business and Enterprise)<br />Filter projects in *Security center → Code analysis* by active sign-in method: Google, Apple, email, phone, and SAML SSO. This makes it faster to audit which projects fall outside workspace authentication policy.
  * [Group exports ](/features/groups#export-group-membership)(Business and Enterprise)<br />Download group membership as a CSV file from *Settings → Groups*. Exports include workspace name and ID, group name and ID, user name and ID, email, date added, and who added them.
  * [Server-side group member search](/features/groups)<br />Searching within a workspace group is now faster and more reliable, returning matching members directly regardless of group size.
  * [SCIM provisioning errors ](/features/business/scim)(Enterprise)<br />View SCIM provisioning failures in *Settings → Identity*. Previously, errors like domain blocks failed silently, leaving you unaware that users were not provisioned.
  * **Privacy and security settings layout**<br />The *Privacy & security* tab in workspace settings is now organized into five cards: Access & membership, Publishing, Sharing, MCP servers, and Data protection. The settings themselves have not changed.

  ### Improvements and bug fixes

  * **GPT-Image-2 for premium image generation.** When generating images at premium quality, Lovable now uses GPT-Image-2. Lovable continues to select quality level automatically, with better results for images that require legible text or precise visual detail.
  * **[Profile visibility](/introduction/lovable-account-settings#profile).** You can now choose whether your Lovable profile is public or private. Public profiles are visible to everyone at `lovable.dev/@<username>`. Private profiles are visible only to you, workspace owners, and workspace admins. On Enterprise plans, profiles are private by default. On all other plans, profiles are public by default.
  * **Remix progress tracking.** The remix dialog now shows a live step-by-step progress checklist, making long remixes easier to follow.
  * **Automatic device previews.** Lovable can now switch the preview device automatically based on what you are building, such as mobile or tablet layouts.
  * [Cross-project reference picker](/features/cross-project-referencing)**.** Project `@` mentions now show the full project name, description, preview image, and more project details, using the same layout as the command palette. Clicking the preview image opens the referenced project in a new tab, making it easier to choose the right project when names are similar or vague.
  * **Referral sharing.** Referral sharing now includes a QR code for your invite link, making it easier to move the link from desktop to phone or share it in person.
  * **Project creation feedback.** When you create a project from the dashboard, the send button now turns into a loading indicator immediately after submit. Project creation can take more than ten seconds, and the form previously gave no feedback while the project was being created.
  * **Feature suggestions persist.** Feature suggestions now stay visible when you refresh a project or come back to it later. Previously, they only appeared right after a new message arrived.

  ### Removed

  * **Speed tab.** The standalone Speed tab has been removed. Speed and Lighthouse checks for performance, accessibility, mobile usability, and indexing now live inside the [SEO and AI search review](/features/seo-aeo) under *Services → SEO & AI search*. The SEO and AI search review replaces the previous Speed dashboard.
  * **GitHub button in editor top navigation.** The [GitHub](/integrations/github) button has been removed from the editor top navigation. You can still access project GitHub settings from *Project settings → Git → GitHub* or the `+` (plus) menu in the chat input.
</Update>

<Update label="Apr 24, 2026">
  ### Add payments to your app

  <Frame>
    <img src="https://mintcdn.com/lovable-f9060f1e/mrDY5QSehf60qvoc/images/changelog-images/2026-apr-23-lovable-payments.png?fit=max&auto=format&n=mrDY5QSehf60qvoc&q=85&s=247f2c10938753d65909e69cfb2050a6" alt="2026-apr-23-lovable-payments" width="1846" height="1234" data-path="images/changelog-images/2026-apr-23-lovable-payments.png" />
  </Frame>

  [Lovable payments](/features/payments) lets you add subscriptions and one-time payments to any app using the built-in Paddle or Stripe integrations. Lovable handles the setup and infrastructure, including account creation, webhooks, and subscription data, so you can focus on building your product.

  Set up a working test checkout in minutes, create products and pricing, and go live the same day. Lovable payments supports SaaS, subscriptions, one-time purchases, memberships, and digital products. Stripe can also be used for physical products, but inventory and logistics need to be handled separately. Available on paid plans.

  ### Lovable desktop app

  [Lovable desktop](/integrations/desktop-app) is now available as a native app for macOS, with Windows support coming soon. It includes the full web experience along with support for local MCP servers, multi-project tabs, and keyboard shortcuts.

  Local MCP support lets Lovable connect directly to tools running on your machine, such as Figma Desktop and Paper, so it can read design files and use that context while building your app.

  ### Opus 4.7

  Lovable now incorporates Claude Opus 4.7, improving code quality, instruction following, and performance across complex, multi-step tasks. For more information, see [**Opus 4.7 in Lovable announcement**](https://lovable.dev/blog/opus-4-7-now-in-lovable).

  ### Chat history search

  Lovable can now search and reference the full history of your project. It can retrieve specific past messages, run keyword searches across the full conversation, and answer semantic questions like "*what design style did I ask you to use?*". This helps it recover the exact context it needs before taking the next step.

  ### Group-based access and granular publishing

  [Groups](/features/groups) let you organize workspace members and control access across projects, folders, and published apps. Supports SCIM sync from identity providers. Available on Business and Enterprise plans.

  * Workspace admins and owners can organize users by team or role in *Settings → Groups* to manage access across projects and folders.
  * Restrict access to your published apps by sharing them with specific groups or individuals instead of the entire workspace.

  ### Connector updates

  [Connectors](/integrations/introduction) are now easier to discover, manage, and control across your workspace.

  * **Dedicated connectors experience**<br />Connectors now open in a dedicated interface from the dashboard instead of being nested inside settings.
  * **App connectors and Chat connectors**<br />Connector categories have been renamed to make it clearer what powers your apps versus what provides context in the chat.
  * **Manage private projects in connections**<br />Workspace admins can now see private projects linked to an app connector directly from the connections table.
  * **Connection access controls**<br />Restrict connections to specific users or the entire workspace. Only users with access can link the connection and access projects that use it, while others are blocked. Workspace admins and owners always retain access. Applies during development only; published apps are not affected.

  ### Productivity app connectors: Google Workspace, Microsoft 365

  Your apps can now integrate with major workplace tools across Google Workspace and Microsoft 365. These connectors let your apps read, write, and automate workflows across email, files, documents, spreadsheets, calendars, and presentations. Connections operate on the data of the connected account.

  * [Google Workspace](/integrations/google-workspace) includes Gmail, Drive, Docs, Sheets, Slides, and Calendar.
  * [Microsoft 365](/integrations/microsoft) includes Outlook, Teams, OneDrive, Word, Excel, PowerPoint, and OneNote.

  ### Data app connectors: BigQuery, Databricks, Snowflake

  Your apps can now connect to more data warehouse platforms, making it easier to build dashboards, internal tools, analytics features, and data workflows directly on top of the data your team already trusts.

  * [BigQuery](/integrations/bigquery) lets your apps run SQL, explore datasets and schemas, and build analytics features.
  * [Databricks](/integrations/databricks) lets your apps query data with SQL, manage clusters and jobs, read and write to Unity Catalog, and access workspace resources.
  * [Snowflake](/integrations/snowflake) lets your apps run SQL, work with warehouses, databases, and schemas, and build internal tools and dashboards backed by Snowflake data.

  ### Business app connectors: Asana, Ashby, HubSpot

  Your apps can now integrate with business systems for task management, recruiting, and CRM workflows.

  * [Asana](/integrations/asana) lets your apps read and create tasks for project automation and planning.
  * [Ashby](/integrations/ashby) brings hiring data into your apps for recruiting workflows and candidate management.
  * [HubSpot](/integrations/hubspot) supports CRM workflows like lead dashboards, sales tools, onboarding flows, and support assistants.

  ### Email and workflow app connectors: Inngest, Resend

  Your apps can now integrate with tools for background workflows and email delivery.

  * [Inngest](/integrations/inngest) lets your apps run durable workflows, scheduled jobs, and event-driven background tasks through your own Inngest account.
  * [Resend](/integrations/resend) lets your apps send transactional and marketing emails through your own Resend account.

  ### Knowledge and content app connectors: Fireflies, Gemini Enterprise, WordPress

  Your apps can now integrate with external knowledge sources, including meeting data, enterprise search, and content management systems.

  * [Fireflies](/integrations/fireflies) lets your apps access meeting transcripts, summaries, action items, and conversation insights.
  * [Gemini Enterprise](/integrations/gemini-enterprise) lets your apps build grounded search and Q\&A experiences on top of your existing enterprise data, with citations and access controls.
  * [WordPress](/integrations/wordpress-com) lets your apps fetch posts, pages, and media from *WordPress.com* to power dynamic, content-driven experiences.

  Workspace admins and owners can configure app connectors in *Connectors → App connectors*.

  ### Chat connectors: Sentry MCP

  **Sentry MCP** is now available as a [chat connector](/integrations/mcp-servers). This lets Lovable read and investigate errors directly from your Sentry account so you can debug issues faster without switching tools.

  You can configure chat connectors in *Connectors → Chat connectors*.

  ### Security updates

  New controls and visibility tools help workspace admins and owners on Business or Enterprise plans enforce stronger security and manage identity at scale.

  * [Auth policy](/features/security-center) (Business and Enterprise)<br />Control which sign-in methods are allowed across every project in your workspace. Configure this in *Settings → Security center → Auth policy*.
  * [Export secrets as CSV ](/features/security-center)(Business and Enterprise)<br />Export all or selected secrets for auditing and rotation workflows from *Settings → Security center.*
  * [Audit logs improvements](/features/audit-logs) (Enterprise)<br />Improved search, filtering, grouped events, expanded event coverage, and human-readable context to make it easier to investigate activity in *Settings → Audit logs.*
  * [**SCIM activity overview**](/features/business/scim) (Enterprise)<br />A dedicated view of identity sync health, failed events, and per-sync timelines for SCIM provisioning in *Settings → Identity*.

  ### Workspace provisioning

  Bulk-provision all users from a verified email domain into your workspace in a single action. Select a domain, preview users, assign a default role, and provision your organization at once. Available on Enterprise plans in *Settings → Identity*.

  ### SAML 2.0 single sign-on for your apps

  You can now add SAML 2.0 SSO to Lovable Cloud apps from *Lovable Cloud → Users → Auth,* or ask the agent to “Add SAML SSO to my app.”

  Lovable collects your identity provider metadata and email domains, then configures authentication automatically. Works with Okta, Azure AD / Entra ID, OneLogin, and other SAML 2.0 providers.

  ### Dashboard organization and navigation

  * [Sort projects by popularity](/introduction/project-search-and-find)<br />You can now sort your projects by visitor count across different time windows (24 hours, 7 days, or 30 days). Project cards show traffic for published projects, and apps with traffic spikes get a visual indicator that links directly to analytics. A new *Most visitors today* tab highlights your top-performing published projects.
  * [Persistent dashboard filters](/introduction/project-search-and-find)<br />Dashboard filter, sort, and search preferences now persist in the URL, so you can navigate, refresh, or share focused views without losing your place.
  * [Folder collaborators](/introduction/project-folders)<br />You can now add individuals and groups as collaborators on folders, with admin, edit, and view roles. This lets you manage access to all projects in a folder at once instead of updating projects individually.

  ### Improvements and bug fixes

  * [Code execution on Enterprise plans.](/features/generate-files) On Enterprise plans, Lovable can now analyze data, generate files, and run code directly in chat without modifying your project.
  * **Auto-generated SEO descriptions.** Lovable now generates an SEO-friendly project description during publishing, used for search results and link previews.
  * **Custom domain setup.** Users on paid plans can now choose whether to automatically set up the `www.` subdomain when connecting a custom domain.
  * **Cloud Storage management.** You can now delete buckets and folders directly from *Lovable Cloud → Storage*.
  * **Supabase alerts.** Lovable Cloud resource exhaustion alerts now run hourly instead of daily, so you are notified of issues sooner.
  * **Shopify connections.** Shopify connections are now per-user. Each collaborator connects their own account via OAuth, with permissions based on their Shopify role. Tokens refresh automatically and prompt reconnection when expired.
  * [Rich folders in the command palette](/introduction/project-search-and-find). You can now browse folders and the projects inside them directly from the command palette, making it faster to navigate your workspace without leaving the keyboard.
  * **Command palette connectors.** Opening connectors from the command palette now keeps you inside your project instead of redirecting you away.
  * **Instant UI updates.** Changes to projects, folders, and members now appear instantly in the UI.
  * **Live preview updates.** The live preview now refreshes once per agent update instead of multiple times, reducing flicker and incomplete states while code is being written.
  * **Fullscreen chat persistence.** Fullscreen chat state now persists on reload and exits automatically when new edits run.

  ### Removed

  * **Public project visibility.** Public project visibility has been removed. All public projects have been updated to *workspace* visibility, and access is controlled through [project access](/features/project-visibility) settings. To let others copy and remix your project, go to *Project settings* and turn on *Enable public remixing*.
  * **Labs tab.** The *Labs* tab has been removed from settings. GitHub branch switching is now enabled by default.
</Update>

<Update label="Apr 2, 2026">
  ### Generate files and analyze data

  <Frame>
    <img src="https://mintcdn.com/lovable-f9060f1e/-NNnndm4SIJU4jpf/images/changelog-images/2026-apr-1-code-exec.png?fit=max&auto=format&n=-NNnndm4SIJU4jpf&q=85&s=553d3ae8dbdb6e56e13fc210841be7f9" alt="2026 Apr 1 Code Exec" width="1848" height="1316" data-path="images/changelog-images/2026-apr-1-code-exec.png" />
  </Frame>

  Lovable can now run code and [generate downloadable files](/features/generate-files) directly inside the conversation. Analyze uploaded files, transform data, create charts, and generate outputs like PDFs, Excel spreadsheets, PowerPoint presentations, and more, all without leaving the chat. Generated files stay in the conversation, can be refined in follow-up prompts, and never modify your project's source code.

  Available on Free, Pro, and Business plans.

  ### App emails

  <Frame>
    <img src="https://mintcdn.com/lovable-f9060f1e/-NNnndm4SIJU4jpf/images/changelog-images/2026-apr-1-app-emails.png?fit=max&auto=format&n=-NNnndm4SIJU4jpf&q=85&s=c7d806a4e380bd41d6d32d1be647e309" alt="2026 Apr 1 App Emails" width="1846" height="1234" data-path="images/changelog-images/2026-apr-1-app-emails.png" />
  </Frame>

  You can now [send custom transactional app emails](/features/custom-emails) from your own domain, extending Lovable's email system beyond authentication flows. Send order confirmations, receipts, shipping updates, security notices, and other user-triggered emails with branded templates, automatic unsubscribe handling, and built-in suppression lists. Lovable handles domain verification, email authentication, and delivery infrastructure for you, so no external email provider is required.

  Available on paid plans for Lovable Cloud projects.

  ### App connectors: Aikido, GitLab, and AWS S3

  Your apps can now integrate with more services for data, security, and developer workflows. These integrations expand what you can build in Lovable by allowing your apps to interact directly with external platforms.

  [Aikido](/integrations/aikido) brings AI-powered penetration testing to Lovable, helping you identify real exploitable vulnerabilities through dynamic testing. Findings can be synced directly into your project's *Security view*, and Aikido generates downloadable, shareable reports for security reviews, compliance workflows, and stakeholder communication.

  [GitLab](/integrations/gitlab) enables two-way sync between Lovable and your repositories for code backup, collaboration, and deployment. It supports both GitLab.com and GitLab Self-Managed, so teams can keep code entirely within their own infrastructure while syncing changes between Lovable and the default branch.

  [AWS S3](/integrations/aws-s3) lets you build apps that read and write files directly in Amazon Simple Storage Service (Amazon S3). You can browse bucket contents, download files through signed URLs, and upload new objects when write access is enabled, making it easy to work with datasets, exports, uploads, and other file-based workflows.

  Workspace admins and owners can configure app connectors in *Connectors → App connectors*.

  ### Chat connectors: Hex, Confidence, and PostHog

  Three new MCP servers are available as [chat connectors](/integrations/mcp-servers). This allows Lovable to interact directly with external services and use their data as context while building apps.

  **Hex** connects Lovable to your Hex workspace so you can query notebooks, explore data, and use results directly while building apps and workflows.

  **Confidence** connects Lovable to your feature flags and experiments so you can evaluate flags, access experiment results, and incorporate experimentation logic into your applications.

  **PostHog** connects Lovable to your product analytics so you can query user behavior data, run analyses, and build features informed by real usage insights.

  You can configure chat connectors in *Connectors → Chat connectors*.

  ### AI-powered visual edits

  Visual edits are now fully AI-powered and work across your entire app, including dynamic content from databases and APIs. You can select and update any UI element visually, without writing code, even while the agent is running. The feature is now free to use within daily limits, making it easier for designers, marketers, and product teams to iterate quickly alongside developers.

  ### Project comments

  You can now collaborate directly inside Lovable by leaving [comments and annotations](/features/project-comments) on elements in your project preview. Anyone with access to the project can join the discussion, and you can send a thread straight to the agent either by tagging **@Lovable** or using **Send to chat**. This creates a tight feedback loop between review and implementation without leaving the editor.

  ### Redesigned domain purchasing

  [Buying and connecting custom domains](/features/custom-domain#buy-a-domain-through-lovable) is now a faster, smoother, and fully in-app experience. Search for a domain, check out through Stripe, and Lovable automatically handles registration, DNS, SSL, and setup for both the root domain and `www` version. Domains are managed at the workspace level and can be connected to projects as needed, making it much easier to launch on a branded URL. Available on paid plans.

  ### Security updates

  Several new workspace-level controls and visibility tools help you enforce stronger security standards and identify risks earlier.

  * [Security center updates](/features/security-center)<br />Workspace admins and owners on Business and Enterprise plans can now access a *Secrets overview* tab in *Settings → Security center*, where all project secrets are aggregated in one place. You can sort or filter by age, type, and security warnings to identify outdated or exposed credentials and take action to secure your workspace. <br /><br />You can also trigger security scans directly from the *Security center* overview, with a centralized view of scan history and coverage across projects. This makes it easy to identify unscanned or risky projects and ensure consistent security coverage.
  * **Audit log export**<br />Workspace admins and owners on Enterprise plans can now export [audit logs](/features/audit-logs) as JSONL files for external analysis, reporting, and compliance workflows.
  * **Publishing controls**<br />Two new controls in *Settings → Privacy & security* allow workspace admins and owners to prevent apps from being published or updated if critical vulnerabilities are detected or if a basic security scan has not been completed, helping ensure insecure applications are never deployed. The settings are:
    * *Block publishing with critical findings*
    * *Require basic security scan before first publish*

  ### Browser performance tools

  Lovable can now diagnose and troubleshoot performance issues in your applications.

  The agent can profile Core Web Vitals, resource loading, memory usage, DOM complexity, and long tasks. It can also record CPU profiles and identify the exact functions responsible for slowdowns, making it much easier to debug and optimize performance.

  ### Image tools

  Lovable can now zoom into and crop specific regions of uploaded images directly in chat. This makes it easier to inspect details, reference UI elements, and guide the agent with more precise visual context.

  ### Command palette

  The command palette (`Cmd + K`) has been redesigned to make navigation and actions faster from the keyboard.

  You can search across projects, tools, and settings, switch workspaces, trigger actions, and access Lovable Cloud features without leaving your keyboard.

  ### CDN and reverse proxy support (reintroduced)

  Users on paid plans can once again connect custom domains that route traffic through [your own CDN or reverse proxy](/features/custom-domain#advanced-use-a-cdn-or-reverse-proxy), such as Cloudflare, CloudFront, or Fastly. This capability has been reintroduced with a simpler and more reliable setup.

  When connecting a domain, expand the *Advanced* section and enable *Domain uses Cloudflare or a similar proxy* to switch to a CNAME-based configuration. You add a single CNAME record pointing to your Lovable project, and Lovable handles SSL provisioning when the record is live.

  You are responsible for configuring and maintaining your CDN or proxy. Lovable does not configure or manage proxy setups.

  ### Workspace onboarding and discovery

  These updates, available on Business plans and above, make it easier for users to find, join, and get access to the right workspaces during onboarding.

  * **Automatic workspace joining for verified emails (Domain JIT)**<br />Previously, just-in-time (JIT) provisioning was available through SSO only. Now, new users signing up with a verified company email can be automatically placed into the correct workspaces with the appropriate permissions. This removes the need for manual invites and speeds up onboarding. Workspace admins and owners can enable this feature and set the default role for newly joined users in *Settings → Identity → User provisioning*.
  * **Workspace discovery**<br />Users can now discover and request access to existing workspaces within their organization during onboarding. Workspace admins and owners can control visibility and manage this setting in *Settings → Privacy & security*.

  ### Improvements and bug fixes

  * The dashboard now loads significantly faster by using server-side search with pagination instead of fetching all projects at once. This reduces both network requests and payload size.
  * Search on the dashboard *All projects* page now includes folders alongside projects, and folders are now visible in mobile search results. This makes it easier to locate content across devices.
  * You can now choose the workspace and folder when remixing a project, giving you more control over where new projects are created.
  * Fixed an issue where chat drafts could be lost on page refresh. Drafts are now reliably restored before any components initialize.
  * Fixed an issue where users invited to SSO-enforced workspaces could hit an error page when signing up with a password. Users are now automatically redirected to the correct login flow.

  ### Removed

  * **Test and Live environments (Beta)**<br />As of March 24, 2026, Test and Live environments are no longer available for new Lovable Cloud projects. Existing projects will continue to have access, but the feature cannot be re-enabled once disabled. We are iterating on this feature based on beta feedback and plan to bring it back in an improved form.
</Update>

<Update label="Mar 16, 2026">
  ### App connectors: Twitch, Twilio, Linear, Telegram, and Contentful

  <Frame>
    <img src="https://mintcdn.com/lovable-f9060f1e/9KJo6qtgyGsl74nY/images/changelog-images/2026-mar-16-shared-connectors.png?fit=max&auto=format&n=9KJo6qtgyGsl74nY&q=85&s=50682df809d08f1d96182cda171b7d8b" alt="2026 Mar 16 App connectors" width="1848" height="1234" data-path="images/changelog-images/2026-mar-16-shared-connectors.png" />
  </Frame>

  Your apps can now integrate with more services for communication, content, and developer workflows. These integrations expand what you can build in Lovable by allowing your apps to interact directly with external platforms.

  [Twitch](/integrations/twitch) lets your app access Twitch API so you can build overlays, dashboards, moderation tools, and community apps that respond to activity on a channel.

  [Twilio](/integrations/twilio) lets your app reach users through messaging and voice. With Twilio, your app can send SMS notifications, manage phone-based workflows, support WhatsApp messaging, and build features that communicate with users outside the app interface.

  [Linear](/integrations/linear) lets your app interact with issues, projects, teams, cycles, and comments in your Linear workspace so you can automate workflows, build dashboards that track progress, and connect engineering tasks directly to your application.

  [Telegram](/integrations/telegram) lets your app communicate with users through chats, groups, and channels using the Telegram Bot API. Telegram bots act as a conversational interface for your app so users can receive updates, request information, or trigger workflows directly from chat.

  [Contentful](/integrations/contentful) lets your Lovable app fetch published content from your Contentful space through the Content Delivery API. This allows you to build dynamic pages, product catalogs, blogs, and documentation powered directly by your CMS content.

  Workspace admins and owners can connect these services in *Connectors → App connectors*, and they will be available to all members across all projects in your workspace.

  ### Chat connectors: Polar and Sanity

  <Frame>
    <img src="https://mintcdn.com/lovable-f9060f1e/9KJo6qtgyGsl74nY/images/changelog-images/2026-mar-16-mcp.png?fit=max&auto=format&n=9KJo6qtgyGsl74nY&q=85&s=605fe504cb2b7339f3fe0fbebeba3be1" alt="2026 Mar 16 Mcp" width="1848" height="1234" data-path="images/changelog-images/2026-mar-16-mcp.png" />
  </Frame>

  Two new MCP servers are available as [chat connectors](/integrations/mcp-servers). This allows Lovable to interact directly with external services and use their data as context while building apps.

  **Polar** connects Lovable to your Polar billing setup so your apps can incorporate real subscription and billing context. Lovable can access your products, customers, subscriptions, and pricing so it can scaffold SaaS apps, checkout flows, and subscription management features.

  **Sanity** connects Lovable to your Sanity CMS so the agent can access your documents, schemas, and structured content while building apps. Lovable can read your content model and generate apps, landing pages, and interfaces aligned with your CMS structure.

  You can configure chat connectors in *Connectors → Chat connectors*.

  ### Authentication emails

  You can now send [authentication emails](/features/custom-emails) from your own domain instead of the default Lovable Cloud sender. This improves deliverability, protects your domain reputation, and keeps the login experience consistent with your brand.

  Lovable automatically manages domain verification and authentication (DNS, SPF, DKIM, and DMARC) so no external email provider setup is required. You can configure your sending domain, customize branding and templates, and manage authentication emails such as signup confirmations, password resets, magic links, invitations, email change confirmations, and reauthentication messages.

  Available on paid plans for Lovable Cloud projects.

  ### Workspace knowledge

  You can now define shared rules and conventions once and apply them automatically across every project in your workspace.

  [Workspace knowledge](/features/knowledge) is designed for instructions that should stay consistent across projects, such as coding standards, architecture patterns, preferred libraries, or brand voice guidelines. This helps teams avoid repeating the same instructions in every project and ensures new projects follow the same conventions automatically.

  Workspace admins and owners can manage workspace knowledge from *Settings → Knowledge* or *Project settings → Knowledge*.

  ### Audit logs

  Workspace [audit logs](/features/audit-logs) are now available on Enterprise plans. Audit logs provide a searchable history of activity across your workspace so you can review changes, monitor access, and investigate unexpected behavior.

  Workspace admins and owners can filter logs by action, member, or time range to review events such as workspace membership changes, project activity, authentication events, integration changes, and workspace configuration updates.

  Each entry shows who performed the action, when it occurred, what changed, and which resource was affected. You can expand entries to view detailed metadata associated with the event.

  Audit logs are available in *Settings → Workspace → Audit logs*.

  ### Bulk management of workspace members

  Workspace admins and owners can now [manage multiple members](/features/people#invite-members) at once. Enable *Select mode* on the People page to change roles, set credit limits, remove users, or revoke invitations for several members simultaneously.

  This significantly reduces administrative overhead for larger workspaces.

  ### Workspace invite links

  Editors and above can now invite people to your workspace using a [shareable link](/features/people#invite-by-link) instead of entering email addresses individually. Invite links are available on Free, Pro, and Business plans.

  Invite links are role-based and expire after 5 days. Only one active invite link per role can exist at a time, and creating a new link automatically replaces the previous one.

  Workspace admins and owners can regenerate or delete links at any time from *Settings → People*, or disable them entirely from *Settings → Privacy & security → Invite links*.

  ### Nano Banana 2 (Gemini 3.1 Flash Image) support

  [Lovable AI](/integrations/ai) now supports Nano Banana 2, Google's Gemini 3.1 Flash Image model. This specialized model provides fast, high-quality image generation and editing so you can build richer visual features directly inside your projects.

  ### Lovable Cloud updates

  Lovable Cloud now provides better visibility and smoother workflows.

  * [Per-project Cloud usage breakdown](/integrations/cloud#usage) now appears in the *Usage* tab in the Cloud section. You can see a percentage breakdown of how each project consumes Cloud resources and how that contributes to your overall Cloud balance.
  * [Cloud tools now auto-approve by default](/integrations/cloud#configuring-lovable-cloud-tools), which reduces interruptions while building. You can switch back to manual approval in settings if you prefer to review tool actions before they run.

  ### Better dashboard organization and navigation

  These updates improve how you organize and navigate projects across the dashboard.

  * Recently viewed projects now load significantly faster across the dashboard, sidebar, and search.
  * A new *Last viewed* sort option helps you quickly return to the projects you accessed most recently.
  * The *Created by me* filter in the dashboard sidebar gives you immediate access to projects you authored.
  * Folder search now includes projects inside nested subfolders.
  * You can now create a folder directly from the *Move to folder* dialog if the folder does not already exist.
  * The *cmd+K* search modal now displays folder results more clearly, which improves keyboard navigation across projects and folders.

  ### Project management updates

  These updates improve how you manage projects across workspaces.

  * You can now choose the destination workspace when remixing a project.
  * You can now name a project during the remix flow instead of renaming it afterward.
  * You can now transfer projects directly from the project card dropdown menu on the dashboard.
  * Project cards now include a share dropdown so you can copy project links or published app URLs directly from the dashboard.
  * On Enterprise plans, workspace admins and owners can allows workspace editors to transfer projects they own to their personal workspaces. This ensures students and team members in enterprise cohorts can retain access to their private projects when a course or program ends. Find it in *Settings → Privacy & security → Allow editors to transfer projects.*

  ### Image generation updates

  * Lovable now generates higher-quality images with intricate details, accurate in-image text, and realistic app UI mockups. The agent automatically selects the most suitable image generation model for each request.
  * You can now generate images with transparent backgrounds directly from the chat so generated assets blend seamlessly into your designs.

  ### Improvements and bug fixes

  * All newly created projects now open in fullscreen mode automatically. This provides a more focused workspace from the start and ensures a consistent project creation experience.
  * Lovable now loads code more efficiently. Lovable loads the file tree first and fetches file contents on demand, which significantly improves performance for larger projects.
  * The code editor sidebar now combines filename search and content search into a single experience so one query shows both matching file names and files containing matching code.
  * Shopify onboarding now requires fewer steps and automatically detects your country during setup.
  * SSO-only login is now enforced on Enterprise plans, which prevents sign-in through other authentication methods.
  * Commits pushed by Lovable now include your GitHub identity as a co-author, which improves traceability and audit history within repositories.
  * The *Plan mode* toggle now appears as an icon button in the prompt box This aligns it with other project controls.

  ### Removed

  * *Themes* have been removed from the *Design* view due to low usage and performance issues.
</Update>

<Update label="Feb 23, 2026">
  ### Cross-project referencing

  <Frame>
    <img src="https://mintcdn.com/lovable-f9060f1e/5CDA2mgDb282G-4F/images/changelog-images/2026-feb-23-cross-project.png?fit=max&auto=format&n=5CDA2mgDb282G-4F&q=85&s=39fd829391e7bd137e92e348197739b3" alt="Example of referencing a project within the Lovable prompt box" width="1846" height="1234" data-path="images/changelog-images/2026-feb-23-cross-project.png" />
  </Frame>

  Lovable can now access and reuse implementations from other projects in your workspace using [cross-project referencing](/features/cross-project-referencing).

  You can explicitly reference a project using `@` mentions in chat, or simply ask Lovable to use an existing project when relevant. Lovable reads the file structure, source code, and relevant chat history to understand how something was built, then recreates or adapts it in your current project. Referenced projects remain unchanged.

  Projects can opt out in *Project settings → Cross-project sharing*, and workspace admins can disable the feature under *Settings → Privacy & security*.

  ### Slack available as an app connector

  <Frame>
    <img src="https://mintcdn.com/lovable-f9060f1e/5CDA2mgDb282G-4F/images/changelog-images/2026-feb-23-slack-connector.png?fit=max&auto=format&n=5CDA2mgDb282G-4F&q=85&s=01c80dbb3ae89e755f25c06726e88af3" alt="Slack logo on Lovable background" width="720" height="481" data-path="images/changelog-images/2026-feb-23-slack-connector.png" />
  </Frame>

  [Slack](/integrations/slack) brings messaging and notifications to your apps. Send channel updates, post structured alerts, and read messages directly from your projects. Perfect for deployment alerts, internal updates, support notifications, or keeping teams informed in real time.

  Workspace admins and owners can connect Slack in *Connectors → App connectors*, and it will be available across all projects in your workspace. You can choose a shared bot for team-wide use or a personal token for individual use, with granular permission control.

  ### Granola MCP available as a chat connector

  You can now [connect Lovable to your Granola account](/integrations/mcp-servers) to give the agent context from your meeting notes and conversations, helping it generate apps and features that reflect decisions and discussions captured in Granola.

  ### Amplitude MCP available as a chat connector

  You can now [connect Lovable to your Amplitude account](/integrations/mcp-servers) to give the agent access to product analytics data, helping you build apps and features informed by real usage insights and metrics.

  ### Opus 4.6

  Lovable's Agent now incorporates Claude Opus 4.6 at no additional cost. For more information, see [Opus 4.6 in Lovable announcement](https://lovable.dev/blog/opus-4-6-now-in-lovable).

  ### Lovable Cloud updates

  Several improvements have been made across [Lovable Cloud](/integrations/cloud).

  * [Cloud region selection](/integrations/cloud#region-selection)<br />You can now choose where your Cloud project is hosted: Americas, Europe, or Asia Pacific. If you set a preferred default region in Cloud connector settings, Lovable uses that region automatically. Otherwise, Lovable selects the region closest to your current location. Choosing a nearby region improves latency and overall backend performance. After Cloud is enabled, you cannot change the selected region, and you cannot move existing projects between regions.
  * **Non-code deployments**<br />Non-code changes such as adding a secret, configuring a storage bucket, or updating environment settings now deploy directly to your Live environment without requiring a code change. This ensures environment updates are applied reliably across [Test and Live environments](/features/environments) without needing a placeholder commit.
  * **Reduced Cloud edge function errors**<br />Cloud reliability has been improved by significantly reducing agent errors related to backend edge function requests. This reduces unexpected failures and improves overall stability for Cloud projects.
  * **Email rate limits**<br />You can now configure the number of emails that can be sent per hour from your project. Adjusting this limit helps control delivery pacing and manage Cloud usage.

  ### SCIM provisioning

  Workspace admins and owners on Enterprise plans can now provision and deprovision users automatically from an identity provider using [SCIM provisioning.](/features/business/scim)

  Identity provider groups can be mapped to Lovable roles such as viewer, editor, and admin so new users receive appropriate permissions automatically.

  ### Guided publishing flow

  [Publishing](/features/publish) now uses a guided multi-step flow. Set your website address, configure access permissions, add a title and description, upload a favicon and social image, review security, then publish. Favicons are now automatically cropped and converted to the correct sizes and `.ico` format.

  ### Folder visibility controls

  You can now set folder visibility to:

  * Workspace visibility: All workspace members can see and add projects to the folder.
  * Private visibility: Only you can see and add projects to the folder.

  You can only configure visibility on the top-level folder. Nested folders inherit the visibility of their parent folder.

  Projects inside a folder inherit that folder’s visibility and their visibility can no longer be set independently. When moving a project, an access preview shows who will gain or lose access, and you can remove redundant collaborators during the move.

  Projects that were already inside folders have not been migrated to the new behavior. They retain their current visibility until you manually update them to match the folder.

  ### Admin controls for app connectors

  Workspace admins and owners on Business and Enterprise plans can now enable or disable specific [app connectors](/integrations/introduction#app-connectors-add-capabilities-to-your-published-app) at the workspace level. Lovable Cloud cannot be disabled.

  This gives teams control over which third-party services are available across the workspace.

  ### External collaborator visibility

  Lovable now clearly indicates when someone is outside your organization, both when inviting them and when viewing access in the "Share" dialog and other relevant areas.

  This helps teams maintain governance and awareness when working with external users.

  ### Project ownership transfer

  You can now transfer ownership of a project to another workspace member directly from "Project settings". This ensures project administration remains seamless if the original owner leaves the workspace or if ownership needs to shift within your organization. A confirmation dialog clearly indicates if your access will change as a result of the transfer.

  ### Improvements

  * The [Plan mode](/features/plan-mode) editor now uses a rendered rich-text view that combines read and edit modes into a single experience.
  * File edits now persist when stopping the agent, so you can resume work without losing changes. Stopping a request immediately halts further processing and token usage.
  * Slide generation has been improved through enhanced knowledge file handling, producing better slideshow results from a single prompt.
  * Project search has been improved with faster full-text search, better substring matching and relevance scoring, and improved stability without unexpected reloads or disappearing results.
  * Users without any workspace memberships now see a dialog to create a new free workspace or find existing ones to join, ensuring they can continue using Lovable even after losing access to a workspace.
  * Invitations to workspaces and projects are now accepted automatically by default. You can change this behavior in *Settings → Your account*.

  ### Removed

  * Drag and drop reordering of pinned tools in the project navigation bar has been removed due to low usage and cross-browser performance issues. Tools can still be reordered by pinning them in the preferred order.
  * The custom domain proxying option has been removed from custom domain settings. Running an app behind a CDN or reverse proxy such as Cloudflare, CloudFront, or Fastly must now be [configured directly with your DNS or proxy provider](/features/custom-domain#advanced-use-a-cdn-or-reverse-proxy).
</Update>

<Update label="Feb 5, 2026">
  ### Plan mode

  Chat mode is now [Plan Mode](/features/plan-mode). Plan mode helps you review and shape Lovable's approach before implementation begins.

  * Review and approve a detailed plan before any code is written
  * Edit and refine plans in a dedicated view before approving
  * Approved plans are saved to `.lovable/plan.md`, so context persists across messages

  This improves reliability on complex requests and reduces rework during implementation.

  ### Prompt queue (with repeatable items)

  The [prompt queue](/features/agent-mode#prompt-queue) lets Lovable process one prompt at a time. While Lovable is working, you can continue sending prompts and they will be added to a visible queue above the chat input.

  * Pause and resume the entire queue as needed
  * Reorder, edit, copy, or remove individual queued prompts
  * Repeat a queued prompt a specified number of times (up to 50)

  This makes it easier to batch work, collaborate without waiting, and automate repetitive workflows.

  ### Browser testing

  [Browser testing](/features/browser-testing) lets Lovable interact with your app in a real browser running in a virtual environment, so it can test your app like a real user.

  * Navigate pages and test user flows end-to-end
  * Capture screenshots of the app
  * Click UI elements and fill out forms
  * Read console logs and inspect network requests
  * Observe real behavior when debugging or verifying changes

  ### Test and Live environments (Beta)

  <Warning>
    As of **March 24, 2026**, this feature is no longer available for new Cloud projects.

    Existing Cloud projects that already use this feature will continue to have access.
  </Warning>

  Lovable Cloud projects now support separate Test and Live environments with isolated databases. **Free during Beta**.

  You must publish at least once to create a Live database before enabling Test.

  * **Test** is your workspace for building and experimenting
  * **Live** is the production environment serving real users and is read-only for Lovable

  When you publish, code and database structure are pushed to Live. Test data stays in Test. Live data never gets overwritten.

  ### Seamless Google and Apple authentication

  Lovable now makes it easy to add [Google](/features/google-auth) and Apple sign-in to your Lovable Cloud project.

  * Ask Lovable to add Google or Apple sign-in and it generates the full authentication flow for you
  * Remove signup friction with OAuth-based authentication
  * No password handling or manual authentication setup required

  ### LinkedIn vibe coding level (Beta)

  <Note>
    This feature is no longer supported. LinkedIn has sunset the ability to display the older vibe coding status levels, and the feature has been replaced by [Skills](/introduction/lovable-account-settings#linkedin-skills-beta).
  </Note>

  You can now view your Lovable vibe coding level from L1 to L5 and add it to your LinkedIn profile.

  * Find your level in *Settings → Your account → Vibe coding level*
  * Connect Lovable to your LinkedIn account to add it
  * Appears publicly on LinkedIn under **Licenses & certifications** and updates automatically as your level changes

  ### Custom MCP servers on all paid plans

  [Custom MCP servers](/integrations/mcp-servers#custom-mcp-servers) are now available on all paid plans, not just Business and Enterprise. Find it in **Connectors** → **Chat connectors** → **New MCP server**

  ### New agent and chat UI

  The agent and chat interface has been refreshed to be cleaner and easier to navigate.

  * Condensed cards that group tool calls and actions
  * A details view showing the full timeline of actions Lovable has taken, including tool calls and file changes
  * Cleaner chat for quick scanning

  ### New user profiles

  User profiles have been redesigned to be more expressive and customizable. Profiles are available at `lovable.dev/@yourusername` and lay the groundwork for future community and publishing features.

  * Set a username and add a custom profile banner image
  * Teams can claim a workspace username
  * Bio, location, and link fields let you share more about yourself and your work

  ### Disconnect Shopify stores

  You can now [disconnect a Shopify store](/integrations/shopify#disconnect-a-shopify-store) from a project. Disconnect via the Shopify menu, project settings, or by asking the agent.

  This allows you to:

  * Remix the project (projects with a connected Shopify store cannot be remixed)
  * Connect a different store or create a new one without creating a new project

  ### Custom domain proxying

  When connecting a custom domain, you can now enable [Allow traffic through a CDN or proxy](/features/custom-domain#advanced-use-a-cdn-or-reverse-proxy) to run your Lovable app behind your own CDN or reverse proxy, such as Cloudflare, CloudFront, or Fastly.

  ### Default design templates (Business and Enterprise)

  Set a default [design template](/features/business/design-templates) for your workspace so new projects start with consistent design and structure.

  * Workspace templates can now be marked as default in *Settings → Templates*
  * New projects automatically use the default template, with the option to override

  ### Improvements

  * Extended processing time per request for the Lovable agent, up to 15 minutes, supporting longer browser sessions and more complex tasks
  * Reorder folders in the dashboard sidebar via drag and drop, with support for nesting up to 3 levels
  * Drag to select multiple projects for bulk actions on the dashboard, inside folders, and in starred projects
  * Right-click on projects and folders in the dashboard to open their dropdown menus
  * A new banner encouraging email and password users to enable [two-factor authentication](/introduction/two-factor-authentication-2-fa) for better account security
  * Icon loading optimizations to reduce bundle size and improve initial UI load times
  * [Project visibility](/features/project-visibility) renamed from "Personal" to "Restricted"
</Update>

<Update label="Jan 16, 2026">
  ### Build credit top-ups

  You can now purchase credit top-ups when you run out of build credits, without changing your subscription. Top-ups are billed as a one-time payment and added instantly to your workspace. Find it in *Settings → Plans & credit usage*.

  * Available on Pro and Business plans
  * Purchased in 50-credit increments
  * Valid for 12 months from your most recent top-up purchase

  ### GPT-5.2 and Gemini 3 Flash support

  [Lovable AI](/integrations/ai) now supports GPT-5.2 and Gemini 3 Flash, giving you access to the latest models for building and iterating faster. Enable Lovable Cloud and AI to use these models. **Gemini 3 Flash is now the default model**.

  ### Two-factor authentication (2FA)

  [Two-factor authentication (2FA)](https://docs.lovable.dev/introduction/faq#how-do-i-enable-two-factor-authentication-2fa) adds an extra layer of security to your Lovable account using an authenticator app (recommended) or SMS. This is a form of multi-factor authentication (MFA) that helps you protect your Lovable account. Find it in *Settings → Account → Your account*.

  ### Lovable bonuses

  Earn credits by completing simple actions:

  * **Daily bonus**: Send 25 messages to earn 5 credits (available to all users)
  * **One-time bonuses**: Add a custom domain or invite a collaborator to earn 5 credits (available to newly registered users from Jan 15, 2026)

  ### Smarter agent capabilities

  The Lovable agent continues to get more capable and helpful:

  * Generates videos when prompted
  * Suggests publishing at the right moment and opens the publish menu
  * Cleans up unused edge functions to keep projects tidy
  * Tests authenticated edge functions while you’re logged in, improving reliability for features that require authentication
  * Responds faster by selecting relevant information more efficiently during generation
  * Understands TypeScript projects more deeply, with IDE-level code intelligence for types, references, and relationships

  ### Smoother publishing experience

  Publishing your app is now smoother and clearer:

  * You can generate logos, favicons, and Open Graph images by prompting the agent, making it easier to customize your app before publishing. These assets are then used automatically during publishing.
  * Publishing failures are now visible, with a built-in "Try to fix" action to help you recover.
  * Links and redirects for published apps are more reliable, with better awareness of deployed app URLs.

  ### Better dashboard organization and navigation

  * New "Recent" projects section in the sidebar
  * Nested folders for better organization
  * Drag-and-drop support for projects and folders
  * Redesigned workspace selector, with better default ordering, the ability to reorder workspaces, improved visibility, and faster loading

  ### Security center (v0.1)

  A new security center gives admins a workspace-wide overview of security findings across projects, including code analysis statuses (errors, warnings, scan state) and dependency vulnerabilities with severity levels and affected projects. Find it in *Settings → Workspace → Security center*.

  ### Redesigned "People" page

  The "People" page has been updated with clearer separation between invitations and collaborators, improved searching and filtering, and more reliable sorting.

  ### Improvements

  * **Dependency vulnerability scanning is now available**, with issues in project dependencies reported as security findings you can review and fix like other security issues, and surfaced to workspace admins in the new "Security center".
  * **Lovable now offers a more native mobile experience across the app**, with sheets replacing popovers for menus, navigation, and sharing. "Inbox" and "What’s new" now live inside the top-right avatar menu.
  * **Custom domain setup guidance has been improved**, prompting users to add both `www` and non-`www` variants to avoid common configuration issues.
  * **Payment issues are now surfaced inside the app**, making it easier to spot and resolve failed or overdue payments.
  * **You’ll now receive reminders when rollover credits are about to expire**, helping you avoid losing unused credits.
  * **Chat now provides more natural next-step suggestions**, helping you understand what to do after your first message.
  * **Plan cards in chat mode have been standardized**, with a single "Implement plan" action to streamline the flow.
  * **Vitest is now included in the React template**, enabling the agent to write and run tests without additional setup.
  * **Speech-to-text has been upgraded** to use the new ElevenLabs transcription model Scribe V2, improving accuracy, language detection, and transcription quality for voice input in Lovable chat and apps using ElevenLabs.
  * **Project and workspace settings pages have been redesigned**, replacing modals with dedicated pages while keeping the same settings and options.
</Update>

<Update label="Dec 23, 2025">
  ### Connectors: ElevenLabs, Perplexity, and Firecrawl

  <img src="https://mintcdn.com/lovable-f9060f1e/qZopTUxjSjK_nAD0/images/changelog-images/ai-connectors.png?fit=max&auto=format&n=qZopTUxjSjK_nAD0&q=85&s=01f206f2cc3ea089eb831f01eaec04a5" alt="Ai Connectors" width="3840" height="2160" data-path="images/changelog-images/ai-connectors.png" />

  Your apps can now speak out loud, do research, and pull live data from anywhere on the web. These powerful integrations expand what you can build in Lovable.

  [ElevenLabs](/integrations/eleven-labs) brings voice and sound to your apps. Generate natural-sounding speech in dozens of languages, create character voices for storytelling apps, or add audio briefings to any project.

  [Perplexity](/integrations/perplexity) adds AI-powered research to your apps. Your app can now search the web, synthesize information, and deliver answers backed by verifiable sources. Perfect for building sales prep tools, competitor trackers, or fact-checking apps.

  [Firecrawl](/integrations/firecrawl) transforms websites into structured data. Build job boards that aggregate from multiple sources, price trackers that monitor competitors, or tools that keep website data up to date automatically. Free for Lovable users through April 2026 when choosing managed credentials.

  Workspace admins can connect these services in *Connectors → App connectors*, and they'll be available to all members across all projects in your workspace.

  [Learn more about connectors](/integrations/introduction).

  ### Lovable ChatGPT app

  <img src="https://mintcdn.com/lovable-f9060f1e/qZopTUxjSjK_nAD0/images/changelog-images/lovable-chatgpt-app.png?fit=max&auto=format&n=qZopTUxjSjK_nAD0&q=85&s=0fdeb03e11c5be3c2d9fbd18566ab69e" alt="Lovable Chatgpt App" width="690" height="237" data-path="images/changelog-images/lovable-chatgpt-app.png" />

  Plan your ideas in ChatGPT, then build them instantly in Lovable. The new Lovable ChatGPT app lets you turn conversations into working apps without leaving your chat. Simply tag @Lovable in any ChatGPT conversation to start building, then jump into Lovable to continue editing, iterating, and shipping your project.

  [Learn more about Lovable ChatGPT app](https://lovable.dev/chatgpt-app).

  ### Lovable gift cards

  Give the gift of building. Lovable gift cards are now available, making it easy to gift Lovable to friends, teammates, or clients, and just in time for the holidays. Find them in *Settings → Plans & credits usage*.

  ### Tasks

  The agent now creates visible tasks while working, giving you more control and transparency over what's happening. This makes it easier to follow progress and guide longer or more complex builds. It's a step toward longer-running agents and more sophisticated planning.

  ### Mention code files in chat

  Reference specific files directly in chat by typing `@` or clicking the reference button in the code editor. This makes targeted edits and discussions about specific files faster and clearer.

  ### Project credit usage (new projects only)

  Project settings now show the total credits used for each project, giving you better visibility into actual usage. Project credit totals are only available for new projects.

  ### Verified domain workspace discovery

  Business and enterprise users can now discover and request to join workspaces based on verified email domains, making it easier to find and collaborate with the right team.

  ### Public preview link controls

  Enterprise plans now have the option to disable public preview link creation for workspace members, giving admins more control over how projects are shared externally. You can find this setting in *Settings → Privacy & security.*

  ### Simplified SAML SSO setup

  Business and enterprise plans can now configure SSO more easily by importing SAML configuration directly from a metadata URL, automatically populating all required fields instead of manually entering each value.

  [Learn more about SSO.](/features/business/sso)

  ### Bug fixes and improvements

  * Fixed issue where links in chat didn't always open in new tabs.
  * Updated the [publish](/features/publish) modal to better explain what happens when you publish an app, clarifying that publishing does **not** expose your source code or make the app automatically remixable.
</Update>

<Update label="Dec 10, 2025">
  ### **A more Lovable dashboard**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-dec-10-new-dashborad.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=adee7f326a228a927c093eb26a0ab460" alt="Screenshot of the redesigned Lovable dashboard showing project organization with folders, filters, and grid view" width="2850" height="1574" data-path="images/changelog-images/2025-dec-10-new-dashborad.png" />

  We launched a completely redesigned dashboard with major improvements to navigation and project organization.

  * Star your go-to projects for quick access
  * Stay organized with folders
  * Find projects faster with new filters and global search
  * Discover apps from the community
  * Switch between grid and list views
  * Select new dashboard themes (User settings → Appearance)
  * Use bulk actions: delete, move, remove from folders, transfer between workspaces

  ### **Chat before you build**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-dec-10-start-from-chat-mode.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=ae7849f32074fc557888c20716dc1168" alt="Interface showing the new Chat mode option for starting projects with a conversation before generating code" width="1476" height="486" data-path="images/changelog-images/2025-dec-10-start-from-chat-mode.png" />

  You can now start any new project in **Chat mode**. Instead of immediately generating an app from your first prompt, you have the option to have a conversation with Lovable to refine your ideas before any code is written.

  [Learn more about starting from chat mode](https://lovable.dev/blog/chat-mode-and-questions).

  ### **Opus 4.5 as a core model**

  We upgraded Lovable’s Agent to incorporate **Claude Opus 4.5** for core parts, bringing major improvements to planning, design quality, and accuracy. This results in smoother development loops, 20% fewer errors, and better overall project success. Available automatically to all users at no additional cost.

  [Learn more about Opus 4.5 in Lovable](https://lovable.dev/blog/claude-opus-4-5-in-chat).

  ### **New custom domain actions**

  New actions are now available to help troubleshoot domain configuration issues.

  * **Check status**: Use to check the latest status and verify the DNS records. Appears when the domain status is **Verifying** or **Unable to verify**. Check that your `A` and `TXT` records are added correctly at your DNS provider, especially the full TXT value.
  * **Recover**: Use to review displayed DNS records and update them at your DNS provider to reconnect your domain. Appears when domain status is **Offline**.
  * **Reconnect**: Use to connect the domain again. Appears when domain status is **Removed**.

  [Learn more about custom domains](https://docs.lovable.dev/features/custom-domain).

  ### **Cloud instance upgrade alerts**

  You now receive alerts when approaching your Lovable Cloud resource limits. This lets you upgrade your instance in a timely manner to ensure fast and reliable performance. The upgrade alert in Cloud → Advanced settings also includes a detailed breakdown of usage (disk space, disk IO, CPU).

  [Learn more about Cloud instance upgrade options.](https://docs.lovable.dev/integrations/cloud#advanced-settings-upgrade-instance)

  ### **Connectors hub (formerly Integrations)**

  The Integrations page is now called **Connectors**, and the information has been reorganized to clearly distinguish between:

  * **App connectors**: Add functionality to your apps. Configured once by admins, available to everyone in your workspace. For example, Lovable Cloud, Stripe, Shopify.
  * **Chat connectors**: Connect your personal tool accounts to provide context while building. Only you can access your connections. For example, Notion, Linear, Miro.

  [Learn more about connectors](https://docs.lovable.dev/integrations/introduction).

  ### **Miro MCP available as a chat connector**

  You can now connect Lovable to your Miro account to give the Agent context from your boards and diagrams and generate apps that reflect what you mapped.

  [Learn more about Miro MCP](https://docs.lovable.dev/integrations/mcp-servers).

  ### **Support for unauthenticated MCP servers**

  Business and Enterprise plans can now add custom MCP servers that don’t require authentication.

  [Learn more about custom MCP servers](https://docs.lovable.dev/integrations/mcp-servers).

  ### **Manage tool permissions for chat connectors**

  You now get a clearer overview of tools for each chat connector and can set how the Agent is allowed to use them by default: always allow, ask each time, or never allow.

  ### **Control who can publish externally**

  On Enterprise plans, admins can now restrict external publishing to:

  * Admins & owners
  * Owners only

  This improves security and supports governance for organizations handling sensitive data.

  [Learn more about publishing](https://docs.lovable.dev/features/publish).

  ### **Chat suggestions on mobile**

  Context-aware prompts now appear in chat on mobile, helping you build faster with fewer taps.

  ### **Bug fixes and improvements**

  * Lovable’s generated designs are now more creative and polished.
  * Lovable is now better at understanding and using your imported packages, leading to fewer errors and smoother builds.
  * Default project visibility has been updated to private for all Lovable workspaces that previously had default project visibility set to public.
  * Saving visual and code edits is now \~20% faster.
</Update>

<Update label="Nov 26, 2025">
  ### **MCP servers**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-nov-18-connectors.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=fc9425009c367078e47bbeedb1f5d7f3" alt="MCP servers integration panel showing connections to Atlassian, Notion, Linear, and n8n" width="3840" height="2160" data-path="images/changelog-images/2025-nov-18-connectors.png" />

  Connect Lovable to your work tools: Atlassian (Jira, Confluence), Notion, Linear, and n8n. Pull in PRDs, tickets, and wireframes directly into your builds. n8n workflows let you integrate with 400+ apps like Salesforce, Slack, and Google Sheets. Business and Enterprise plans can add custom MCPs and control which servers are available.

  [Learn more about MCP servers](https://docs.lovable.dev/integrations/mcp-servers).

  ### **Design view**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-nov-26-design-view.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=daf09e67ac4ccd9d3ce0c44bd3634991" alt="Design view panel showing tabs for Visual edits, Themes, and AI image generation tools" width="937" height="277" data-path="images/changelog-images/2025-nov-26-design-view.png" />

  The new Design view provides a dedicated panel where you can seamlessly switch between your project's design tools. This includes updates to Visual edits, as well as new features including Themes and AI image generation.

  ### **Themes**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-nov-18-themes.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=23c5adba9f2ea0029c5ee6055311b3de" alt="Themes panel showing color, typography, and spacing customization options" width="2738" height="1530" data-path="images/changelog-images/2025-nov-18-themes.png" />

  Set your brand standards once: colors, typography, spacing. Apply them to any project. Preview themes before applying to see how they'll look.

  ### **All new Visual edits**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-nov-18-visual-edits.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=2b39b9f256a0b03dd0437c2c3457b9b8" alt="Visual edits interface showing element selection with margin, padding, and style controls" width="3840" height="2160" data-path="images/changelog-images/2025-nov-18-visual-edits.png" />

  Access Visual edits from the Design view or use the Visual edits shortcut in the prompt box (previously Edits), and make your edits directly in the left-hand panel. You can now edit text in elements with mixed content, like buttons containing both text and icons. Select and edit multiple elements at once. Change text directly on the page. Adjust margins, padding, borders, shadows, colors, and icons. Update images or generate images with AI.

  ### **AI-powered image generation in Visual edits**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-nov-18-AI-image-gen.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=251fe311f80ac09605fc6868d0911a28" alt="AI image generation dialog with a text prompt field for describing custom images" width="3840" height="2160" data-path="images/changelog-images/2025-nov-18-AI-image-gen.png" />

  Generate custom images by describing what you want. Create original visuals for your projects without leaving Lovable. AI image generation does not consume Lovable credits.

  ### **Private projects for everyone**

  All plans now include workspace-only projects (enabled by default). Change your default in Settings → Privacy & security.

  [Learn more about private projects](https://docs.lovable.dev/features/private-projects).

  ### **Shopify integration improvements**

  You can now **connect your existing Shopify store** to Lovable. For security, the Lovable user’s email must match the Shopify store owner’s email.

  When creating a **new store**, you now select the store’s location during setup, and the claim flow has been improved with clearer states. When the store is claimed, the Lovable user who claims it becomes the Shopify store owner.

  Authorization updates

  * Only the user who connected an existing store or claimed a new store has write access (create, update, delete products, variants, and discount codes).
  * Collaborators maintain read-only access to Shopify data (search and retrieve products, variants, and discount codes), but can still fully build the storefront.

  [Learn more about the Shopify integration](/integrations/shopify).

  ### **Gemini 3 Pro & image generation support**

  Lovable AI now supports Google's latest models including Gemini 3 Pro and Nano Banana Pro. Enable Lovable Cloud & AI to access these models in your apps.

  ### **Improved share & invite experience**

  The share dialog has been redesigned to make it clearer who can do what in your project. Better permission visibility, a more prominent share preview, and clearer collaboration concepts.

  ### **Cloud storage improvements**

  Manage your storage directly from the Cloud view. Create private or public buckets, organize folders, and upload, rename, delete, or download files. Private bucket files are now visible in the UI, too.

  ### **Questions**

  When your request has multiple ways forward, Lovable can now ask clarifying questions before building. Pick from multiple-choice options or add your own input to help Lovable understand exactly what you're looking for.

  ### **Integrations hub**

  The new Integrations tab in project settings brings together Lovable Cloud, Lovable AI, MCP servers, Supabase, Shopify, and Stripe.

  ### **Chat suggestions**

  Context-aware prompts appear in the chat suggesting what to build next.

  ### **Low credit alert**

  Users on Pro and Business workspaces now see an alert when fewer than 5 build credits remain, along with a shortcut to upgrade the plan to increase monthly credits. The alert appears above the prompt box and in the project and workspace menus, helping ensure you never run out mid-build.

  ### **Temporary education logins**

  Educators can create temporary student accounts at lovable.dev/login/temp for classroom use.

  ### **Improved remix experience**

  See step-by-step progress when remixing projects. Get clear error messages explaining why projects can't be remixed. Remixing runs in the background with a persistent notification, so you can continue working. Now supports remixing projects with custom secrets.

  ### **Better reverts and ability to edit and revert your messages**

  "Restore" is now "Revert". Jump back to any point in your chat history, or edit a past message to explore a new direction. Your original work stays in the chat and can be reapplied anytime.

  ### **Project URL**

  Project URLs are no longer automatically generated on project creation. Set your own unique project URL before publishing or have Lovable auto-generate one for you.

  ### **Project display name**

  Lovable now automatically generates a more meaningful display name for your project. The display name is only visible to you and members of your workspace, not to visitors of your published app. Display names are only unique across a workspace, reducing issues with already reserved names. You can always rename your project to something more meaningful by going to project settings.

  ### **Better commit messages**

  Commit messages now describe what actually changed in your project, not just what you asked for, making it easier to browse your project history.

  ### **Navigation update**

  Privacy & security settings have been moved into their own tab for easier access.

  ### **Bug fixes**

  * Fixed preview reload errors that previously got stuck on "Try to fix" until a page refresh. The system now detects transient errors and retries automatically.
  * Figma Import has been removed due to quality issues. We’re working on something new and exciting here - stay tuned.
</Update>

<Update label="Nov 5, 2025">
  ### **Lovable × Shopify Integration**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-nov-5-shopifyxlovable.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=5c3ffc31a88ccc5b3bd6357f6f5be308" alt="Lovable and Shopify integration showing a storefront builder with product management" width="1100" height="619" data-path="images/changelog-images/2025-nov-5-shopifyxlovable.png" />

  Build an online store by chatting with AI. Lovable sets up products, cart, and checkout; when you’re ready, claim the store in Shopify and publish. Great for everything from hobby shops to large catalogs.

  Bonus: 30‑day Shopify trial when you sign up through Lovable.

  [Learn more about the Shopify integration](/integrations/shopify).

  ### **Show the agent what you mean**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-nov-5-screenshot_capture.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=8d6a0a9db5ab7f3cc5f47b1181f107b0" alt="Screenshot capture feature in chat showing the ability to capture and share screenshots with the agent" width="1520" height="744" data-path="images/changelog-images/2025-nov-5-screenshot_capture.png" />

  The Lovable agent now understands your context better. It knows which tab you're viewing in Lovable - whether that's the Code Editor, SEO, Analytics, Cloud settings, or Secrets - so it can give you more relevant responses. You can ask the agent to screenshot your build, or capture screenshots from anywhere on your computer right from the chat interface.

  ### **Always have enough Cloud & AI funds**

  Top up automatically when your balance drops below \$10, but remain in control of your monthly charges by adding a monthly cap. You can now also track Cloud & AI usage for each project.

  [Learn more about adding Cloud & AI funds](https://docs.lovable.dev/integrations/cloud#adding-funds-paid-plans-only).

  ### **Better custom domain management**

  Set a primary domain for your project, with other custom domains automatically redirected to it. Adding a new domain is now easier with a clearer workflow and step-by-step guidance. We've also added domain validation to verify ownership before your domain goes live.

  [Learn more about custom domains](/features/custom-domain).

  ### **Request access to private projects**

  When navigating to a private project, you'll be able to request access from the project owner. Keeps private work secure while making collaboration easier.

  ### **Workspace-only publishing (Business & Enterprise plans)**

  Published projects can now be set to "workspace-only" access, requiring authentication and limiting access to your workspace members. Perfect for building internal tools and apps.

  [Learn more about publishing.](/features/publish)

  ### **Desktop notifications**

  Enable desktop notifications to know when long-running builds finish. No need to keep checking back to see if you're done.

  ### **Disconnect project from GitHub**

  You can now disconnect your project from GitHub when needed. Useful if you need to transfer it to a different GitHub organization.

  [Learn more about the GitHub integration](/integrations/github).

  ### **Bug fixes**

  * Fixed an issue where the agent's responses would appear all at once instead of typing out gradually.
  * Reduced the number of pop-up notifications you see right after signing up.
  * Error messages now appear more consistently when something goes wrong.
  * Cleaned up spacing and alignment issues in the chat interface.
</Update>

<Update label="Oct 6, 2025">
  ### **Lovable Cloud**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-oct-6-lvbl-cloud-logo.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=81e7d46f8a821092b729e7f3b61dabff" alt="Lovable Cloud logo" width="2880" height="1620" data-path="images/changelog-images/2025-oct-6-lvbl-cloud-logo.png" />

  Build full‑stack apps with no manual Supabase setup. Lovable Cloud gives you on‑demand databases, user authentication, and storage that scales automatically as your app grows.

  Lovable Cloud is available for all new projects, and any existing projects that aren’t integrated with Supabase.

  [Learn more about Lovable Cloud](/integrations/cloud).

  ### **Lovable AI**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-oct-6-lvbl-ai-logo.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=938f9526869a3e9ed7af13cf3a51ba9a" alt="Lovable AI logo" width="2880" height="1620" data-path="images/changelog-images/2025-oct-6-lvbl-ai-logo.png" />

  You can now build AI-native apps in Lovable, just by prompting. We manage provider access & APIs so you can focus on building your product. Through October 13, we’re offering free embedded AI functionality powered by Google Gemini.

  You can now build things like:

  * **Special-purpose ChatGPT clones** — tailored conversational assistants for support, sales, or knowledge work.
  * **Avatar & image generators** — let users create, edit, and customize visual content.
  * **Coaching apps** — personalized guidance, onboarding coaches, habit builders, and more.

  Every plan includes free monthly credits to use towards embedded AI functionality. Yes, even free plans! Full pricing can be found [here](https://docs.lovable.dev/features/cloud#usage-based-cloud-and-ai-pricing).

  [Learn more about Lovable AI](/integrations/ai).

  ### **Voice mode**

  You can now talk to Lovable. We’re unlocking a more intuitive and conversational way of building: describe ideas and edits out loud and Lovable makes it.

  ### **Turn your files into apps**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-oct-6-file-to-app-illustration.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=396b864213258a575717309e2c753501" alt="Illustration showing file types like spreadsheets, resumes, and slide decks being transformed into apps" width="1920" height="1276" data-path="images/changelog-images/2025-oct-6-file-to-app-illustration.png" />

  Drop any file type into Lovable to turn it into an app.

  For example:

  * Sheets → interactive dashboards
  * Resumes → portfolios
  * Slide decks → custom presentations

  ### **Sonnet 4.5**

  Anthropic’s latest model now helps power your builds on Lovable. Expect stronger reasoning, more consistent results, and better performance on multi‑step edits and structured data.

  ### **A smoother build experience**

  Building on Lovable just got smoother: quicker access to the Visual Editor, better long-run UX, and image support in the Code Editor.

  ### **Confidently publish and unpublish**

  Ship with confidence. The publish flow now includes link‑preview editing before you go live. Made a mistake? Unpublish with one click.

  ### **Stripe integration**

  We’ve updated our Stripe integration with clearer billing & payment flows. Setup all your Stripe logic in chat by just describing what you want to build - no manual setup required.

  [Learn more about the Stripe integration](/integrations/stripe).

  ### **Updated community resources**

  Both our Partner page and Remix got upgrades so you can extend what you build through the community. Visit the partner page to find specialized agencies (or apply to be featured), and use Remix on your favorite Lovable Cloud projects to get started faster.

  ### **Better workspace management**

  A new unified member view lets you understand usage and take actions across your team. Admins can now set session duration limits, turn on just-in-time provisioning (SSO), disable publishing and enforce project privacy settings.

  ### **Bug fixes**

  * Fixed in-chat sizing issues that caused horizontal scroll
  * Reduced build errors by 20%
</Update>

<Update label="Sep 1, 2025">
  ### **Student + teacher discount live**

  We’re making it easier for students and educators to get building. Now, both students and teachers can save up to 50% off Pro, for up to a year. The discount applies if you’re starting from a free workspace—so you can unlock the full power of Lovable without stretching your budget. [Learn more about the offer here](https://lovable.dev/students).

  ### **Security upgrades**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-sep-1-security.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=91691edeb0693f677a33f0eb23013364" alt="Security certifications badge showing SOC 2 Type 2 and ISO 27001:2022 compliance" width="1584" height="1042" data-path="images/changelog-images/2025-sep-1-security.png" />

  Security is our priority. We’ve expanded our security features, policies, and certifications including adding SOC 2 Type 2 compliance and ISO 27001:2022 certifications. We also hired an incredible CISO, Igor Andriushchenko – so you can trust us with your ideas, your data, and your customers. Read more about our security features [here](https://lovable.dev/security).

  ### **Your new Lovable Inbox**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-sep-1-inbox.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=9769bf6cc3e5cc6534710889a632e48e" alt="Lovable inbox interface showing project invites and recent updates" width="1584" height="1357" data-path="images/changelog-images/2025-sep-1-inbox.png" />

  Your new personal inbox helps you track project and workspace invites, and you can also check out updates we’ve recently shipped—so you’re always up to speed.

  ### **Smarter SEO for new apps**

  When you create a new app or webpage, Lovable now includes agentic SEO instructions that better respect SEO best practices. This helps your projects get better indexed on search engines and reach the audiences you’re building for.

  ### **Workspace viewer role (Pro+)**

  For Pro+ members, we’ve introduced a new Viewer role. Viewers can see workspace metadata, projects, and members, but can’t create or edit projects or invite others. It’s the perfect role for stakeholders who need visibility, but don’t need to edit projects.

  ### **Flexible plan management**

  <img src="https://mintcdn.com/lovable-f9060f1e/tuanFug-s_mqtbi3/images/changelog-images/2025-sep-1-plan-management.png?fit=max&auto=format&n=tuanFug-s_mqtbi3&q=85&s=59db1a1ef219ecd15adc9a34886274d8" alt="Plan management interface showing upgrade and downgrade options" width="630" height="380" data-path="images/changelog-images/2025-sep-1-plan-management.png" />

  You can now upgrade or downgrade your plan in just a few clicks—whether you need more credits or want to scale down to free.

  ### **Clearer error feedback**

  If the LLM ever misinterprets your request, Lovable now lets you know directly. You’ll see what went wrong so you can adjust your prompt and move forward faster.

  ### **Track your edits + streaks**

  We’ve added a personal dashboard where you can see how many edits you’ve made in Lovable and track your streaks. A great way to stay motivated and see your progress over time. Check it out under your Account Settings.
</Update>

<Update label="Aug 11, 2025">
  ### **Agent Mode is the new default mode**

  With this upgrade, Lovable becomes a truly agentic partner—interpreting requests, understanding your codebase, fixing issues, executing complex multi-step edits across files, integrating with external tools, and reducing errors by 91%, so you can build more ambitious apps faster and with less friction.

  Legacy mode (where you don’t use agent) will be sunsetting on September 1, 2025.

  ### **Real-time analytics on your Lovable apps**

  Curious how your app is performing in the wild? You can now track live traffic and engagement directly inside Lovable including:

  * Visitors: How many people are using your app Pageviews: Which pages get the most attention
  * Visit duration: How long users stay
  * Bounce rate: What percentage leaves instantly
  * Views per visit: How deeply users engage

  The data updates in near real-time so you can spot trends, debug issues, or just celebrate your first users! Available now under Project Settings → Analytics

  ### **Lovable Business plan**

  Introducing the Lovable Business Plan, built for teams that need more control, privacy, and flexibility. It includes everything in Pro, plus powerful upgrades:

  * SSO for secure org-wide sign-in
  * Restricted projects only visible to you
  * Templates for consistent styling
  * Yearly plans now available

  You can now switch to a yearly subscription for any paid Lovable plan. Get a discounted rate, simplify billing, and worry less about monthly renewals.

  ### **Visual edits v2**

  We have refined the visual edits experience after tons of feedback. More responsive, precise, and delightful to use. It’s faster than ever to tweak your UI, fix copy, or adjust layout—without leaving the live preview.

  You can also jump to selected elements in code when using visual edits, tightens the loop between design and implementation.

  ### **Project invites workflow**

  Invited users must now formally accept or decline access to a project—both from email and magic links. This avoids stale “pending” members and improves collaborator tracking.

  ### **Search all files in the code editor**

  Use the file search inside the code editor to quickly locate code and add file paths directly into chat.

  ### **Unified credits bar**

  We’ve shipped a new credits bar that combines all credit types into one clean, unified view—no more jumping between different displays to track usage.

  ### **Upgraded people tab**

  The People tab in workspace settings has been redesigned. It now includes pagination (20 users per page), search, and filtering by member status—making it much easier to manage large teams.

  ### **Scales to large workspaces**

  Thanks to backend improvements, we now support massive workspaces with tens of thousands of members without performance issues.

  ### **Published project badge**

  We’ve added a small but useful touch: all published projects now display a “Published” badge so it’s easier to see what’s live at a glance.

  ### **Bug fixes**

  * Fixed image upload bug causing >1% of initial generations to fail if the user wasn’t logged in.
  * Prevents redundant updates when a project is already up to date with the deployed version.
  * You can now disconnect a project from legacy Supabase when disconnecting the org.
  * Reconnecting orgs with invalid tokens is now seamless.
</Update>

<Update label="Jun 26, 2025">
  ### **Spotlight**

  We've made collaboration on Lovable even more accessible by making it a free feature for all users.

  For Free and Pro users:

  * Workspace collaboration is now completely free – invite your teammates and start building together at no additional cost.
  * Unlocks workspace collaboration for up to 20 members on both Free and Pro plans.
  * On Free plans, additional members join as editors; Pro plans offer granular workspace roles and permissions.

  For Teams plan users:

  * We've simplified our pricing structure and moved you to the Pro plan with significant savings:
    * You've been automatically moved from the Teams plan to the Pro plan.
    * You'll now pay 20% less starting with your next renewal.
    * You still have access to all the same features and credits as before – just at a lower price.
    * All your project and workspace settings remain unchanged.

  ### **Improvements**

  * Redesigned the mobile experience for building apps and websites directly from your phone.
  * Shipped a Visual Edits refresh with new floating combo box controls positioned right next to elements you're editing
  * Added project search functionality with fuzzy matching by name – *tip: rename your projects for better discoverability*.
  * Rolled out full-stack initial generations to all users that will enable you to connect Supabase before doing an initial generation
  * Added a floating prompt bar to our homepage that lets you enter prompt even when scrolled down.
  * Enhanced the history view with a cleaner timeline prioritizing dates, restored versions now visible, and simplified version navigation.
  * Updated the careers page with latest information. [Check it out here](https://lovable.dev/careers).

  ### **Bug fixes**

  * Fixed admin access to integration settings for user projects.
  * Resolved issue where admins couldn’t properly access workspaces, causing editor display and functionality issues when visiting team projects.
  * Fixed iframe redirect issue that was causing unwanted redirects within the Lovable app.
</Update>

<Update label="Jun 4, 2025">
  ### **Spotlight**

  * Enhanced project discoverability with new filtering options to easily find and manage your projects.
  * Added categorization to community projects to make it easier to discover projects by the community.

  ### **Improvements**

  * Chat mode now renders Mermaid diagrams to help visualize your app's back-end logic and structure (ask for it to chart things to trigger this).
  * Auto-configure redirect URLs for Supabase Auth integration - no more manual configuration needed for a more seamless authentication setup.
  * Added in-product feedback system - click the thumbs down button when edits cause issues to help us improve Lovable's AI for everyone.
  * Introduced smart nudges to guide you to Chat Mode when debugging issues that need conversational help.
  * Edit history now shows screenshot previews on hover, letting you quickly see what your app looked like at different stages without opening each version.

  ### **Security**

  * Added API key detection in chat that warns you before accidentally sharing sensitive information like secrets.
  * Rolled out AI-powered "Security review" feature to help identify potential vulnerabilities in your apps. Trigger it before publishing your app via the publish modal.
</Update>

<Update label="May 24, 2025">
  ### **Spotlight**

  * Claude 4 is now being used in Lovable! It's powering most prompts, both for project creation and for edits on all projects (including old projects). This should make Lovable have 25% less errors and be 40% faster overall.

  ### **Improvements**

  * Revamped the setup flow for both GitHub and Supabase, simplifying multi-step onboarding to reduce confusion.
  * Added visual labels to featured projects on the homepage for better discovery.
  * Added support for removing custom domains from your Lovable app.
  * Several improvements in collaborator management:
    * Added validation to the email invite form in the People tab
    * Tooltips now explain the permissions for each role (admin / owner / editor)
    * You can now see the role of pending invites
    * Better error messages for edge cases like inviting someone already in the workspace
  * Commit messages now rely more on conversation history for better context.
  * Improved the quality of streaming: smoother experience and no more flashing text.
  * Users can now view public Lovable projects without being logged in.
  * Active edit cards are now highlighted so it’s easier to see which one is active.
  * The default “Edit Code” button now opens the preview instead of the raw code.

  ### **Bug fixes**

  * Fixed bugs that caused the wrong live preview to show in some cases.
  * Fixed a bug where refreshing the preview could change the current path.
  * Fixed a bug that caused infinite redirect loops when starting a live preview after logging in.
</Update>

<Update label="May 9, 2025">
  ### **Spotlight**

  * We’ve added support for transferring projects between workspaces!
  * Lovable is now better at understanding images — whether you’re uploading a design reference or a real site asset, it knows the difference and will handle it accordingly

  ### **Bug fixes**

  * Fixed issues with published projects and deployed preview links not reflecting the latest version
  * Project visibility settings have returned to team workspaces, but will be disabled for now
  * Fixed issues where workspace owners were not able to edit projects created by non-owners in teams workspace
  * Fixed issue where “downgrade button” in billing page would link to wrong Stripe page
  * Fixed issue where some users were not seeing their plan after upgrading to a higher plan
</Update>

<Update label="May 2, 2025">
  ### **Improvements**

  * Improved credit tracking by making it explicit when you have reached 30 monthly credit cap and being explicit about when both your daily and monthly credits will renew
  * ​Made it possible for you to invite non-users to team workspaces
  * Revamped errors modals to display more helpful messages (e.g. Supabase token issues), not just “Request failed”
  * Updated settings tabs (Projects, Knowledge, Domains) to new design

  ### **Bug fixes**

  * Fixed issues where credits were not refreshed except when refreshing the page
  * Fixed an issues where lovable failed to fetch edge function logs
  * Fixed issue that led GitHub branch switching to fail if you had renamed the repo
  * Fixed bug that was blocking users from applying some SQL migrations
  * Fixed poor styling in mobile pricing page
  * Fixed issue that was blocking project renames
  * Fixed issues where the projects counter in homepage was not showing right number
  * Fixed issues leading to Supabase re-authentication loop
  * Fixed the issues where edits made in Dev Mode where not being saved
  * Fixed the issues where the “Working…” indicator was not appearing for collaborators
</Update>

<Update label="Apr 25, 2025" description="Lovable 2.0">
  ### Lovable 2.0

  We’re so excited to launch **Lovable 2.0**! This one’s all about collaboration, security, and giving you more control.

  <img src="https://mintcdn.com/lovable-f9060f1e/9SLskRqE33AbtOUv/images/lovable-two-point-zero.png?fit=max&auto=format&n=9SLskRqE33AbtOUv&q=85&s=757535605ff1e909a9c2a0ccf266269c" alt="Lovable 2.0 announcement banner featuring the new logo and branding" width="2940" height="1660" data-path="images/lovable-two-point-zero.png" />

  * We’ve rebranded! New logo, brighter colors, and a much cleaner UI. Go check it out below— we hope it feels like a glow-up.
  * [Teams](https://docs.lovable.dev/user-guides/teams): Real-time collaboration is finally here! Invite others to co-edit apps or create shared team workspaces.
  * [**Simplified Pricing**](https://docs.lovable.dev/user-guides/messaging-limits#free-vs-paid-plans-comparison) with two clean options: Pro starts at \$25/month and Teams starts at \$30/month.
  * **Security Scan:** Lovable now checks for vulnerabilities when you publish (if you’re connected to Supabase). This is just the beginning of our work to make vibe coding safer by default.
  * When you try to revert to a past edit after which you ran a migration, Lovable will tell you we're not reverting the Database.
  * You asked, we listened. Chat mode (now [Plan mode](/features/plan-mode)) is now *way* smarter and **here to stay** for everyone. It doesn’t make edits, but it *can* help you reason through problems, plan features, inspect logs, query databases, and more. Think of it as your smart, hands-off pair programming buddy.

  This is a big step forward — and we're just getting started.

  Thanks so much for being on this journey with us
</Update>

<Update label="Apr 17, 2025">
  * Shipped github reliability improvements. We should now be able to sync to GitHub even when the user token has broken.
  * Shipped some preview outdated fixes.
  * When transferring repos, orgs/users that are suspended will be marked so. If clicking you will go to the page to unsuspend it.
</Update>

<Update label="Apr 11, 2025">
  * You can now purchase a domain directly from your project settings — just click “Buy a domain”, search for what you want, and complete the checkout in a few clicks. We’ve partnered with IONOS to make this possible. Read more [here](http://email.lovable.dev/e/c/eyJlbWFpbF9pZCI6ImRnVG1qZ29EQUotUVZKNlFWQUdXRzVfR2VPdTVlSEVGMnU1Wk5hbz0iLCJocmVmIjoiaHR0cHM6Ly94LmNvbS9sb3ZhYmxlX2Rldi9zdGF0dXMvMTkwOTYzMzY1NjQ0MTc4NjYwOCIsImludGVybmFsIjoiZTY4ZTBhMmRhZWRkMDE5ZjkwNTQiLCJsaW5rX2lkIjoyMDk2fQ/de4d0c380fdfac4a4accea202b7884c14b49d33fc1c0ca808b5a4ebc9e6540fe).
  * Updating the favicons is now easier to set up directly from Lovable.
  * Loading larger projects should now be much faster since not all messages are loaded when the project is opened. Additional messages are loaded only when a user scrolls up.
  * Clicking on the Supabase button (shown in first generation) now opens the setting pane. Also added a small What is Supabase? callout for first time users also linking to our docs and tutorials.
</Update>

<Update label="Apr 4, 2025">
  * **New UI:** Updated the editor nav bar design, which moves pages dropdown and related buttons from preview panel header to nav bar.
  * Refactor of diff creation which handles multiple edits to the same file.
  * Upgraded the [Stripe integration](/integrations/stripe).
  * New chat scrolling: Scrolls new user messages to the top of the viewport instead of autoscrolling as text is generated.
  * Lovable now has a Dev Mode. Enabling Dev Mode lets you not only read your project's code, but also edit it directly inside Lovable. Read more about it [here](http://email.lovable.dev/e/c/eyJlbWFpbF9pZCI6ImRnVG1qZ29EQUotUVZKNlFWQUdXRzVfR2VPdTVlSEVGMnU1Wk5hbz0iLCJocmVmIjoiaHR0cHM6Ly94LmNvbS9sb3ZhYmxlX2Rldi9zdGF0dXMvMTkwNzgxNjU2Nzk0NzA5NjM0MSIsImludGVybmFsIjoiZTY4ZTBhMmRhZWRkMDE5ZjkwNTQiLCJsaW5rX2lkIjoyMDk1fQ/c876becf4f48a97a1c3fd592a50e2bb9bcb03651afcb81988c68b031dc617425).
  * Fixed Supabase integration where the AI was creating `config.toml` file in the wrong folders.
  * Fixed so you can close the visual edits with `x` button again, and the `alt+s` hotkey works again in the preview.
</Update>

<Update label="Mar 28, 2025">
  * Turn your LinkedIn profile into a personalized website.
  * Wondering if something’s down? You can now check our status page for live updates. Check it out [here](https://status.lovable.dev/).
  * Shipped that try to fix shows up when screen gets blank.
  * Fixed bug where only the first edge function log is fetched.
  * Fix bug causing infinite requests when going to profile page.
  * Fixed a panic caused by concurrent map writes in the experiment service.
  * Reduced by 4x occurrences of messages where we mix `lov-sql` and `lov-code`.
  * Fixed a bug when labs settings were not being saved now.
  * Previews are back online. Please let us know if your domains are not working.
  * Fixed bug where only the first edge function log is fetched.
  * We made some maor improvements/fixes to Supabase especially how to invoke edge functions.
  * Supabase functions now get deployed when updated in code editor. Also, Supabase functions are updated live in code editor when changed by AI.
</Update>

<Update label="Mar 21, 2025">
  We heard the issues you've shared with us and we're working hard to fix them all. This is what we've shipped on product reliability this week:

  * Fixed bug where AI would create new edge functions instead of fixing existing ones.
  * Labs features settings are now saved to your user account instead of local storage, ensuring they persist across devices.
  * The monthly credits counter is now in the settings menu for quick access.
  * Fixed bug causing the live preview window to go out of sync after AI edits.
  * Fixed Supabase authentication session persistence issues.
  * A complete rewrite of the Custom Domains backend(s). System should more stable now, quicker, self-healing and support unicode domains.
  * *Connect custom domain* as action in publish dialog for users that have not connected any domains to their project yet.
  * Chat mode is faster than ever, fixing the bug where it sometimes just stopped.
  * Added a supabase icon for connected projects in the project card, clickable for your own projects to take you to the supabase dashboard.
  * Full support for SEO and Open Graph images so links (e.g. on X) now show proper card previews.
  * UI update to clarify that Supabase connections happen at the organization level.
  * Shipped memory leak fixes to prevent backend crashes during user requests including long intial runs.
  * Shipped continuous project lock extensions and sandbox pings to support long-running requests without premature termination.
</Update>

<Update label="Mar 14, 2025">
  * We’ve made some improvement to Lovable’s project settings layout for a more intuitive experience. You can now find Project Settings in the top left corner of your project page for quicker access and better navigation. [Here's what's new](https://discord.com/channels/1119885301872070706/1120705825317593149/1350101727768084491).
  * Introducing [custom domains](/features/custom-domain) in Lovable.
  * Announcing the \$10K [Lovable's Build Competition](https://build-launch-win.lovable.app/) with Lovable, Anthropic, Supabase & Sentri.
  * Best website design, \$3K cash winner. [Tweet here](https://x.com/lovable_dev/status/1900574280011731167).
</Update>

<Update label="Mar 7, 2025">
  * [Introducing Versioning 2.0](https://x.com/lovable_dev/status/1896637541618778574) enabling bookmarking, easier restores and improved history view.
  * [Dev Mode:](https://x.com/lovable_dev/status/1897693825767768542) Easily edit any code of your project directly in Lovable. All paid users can enable dev-mode in settings.
  * Fixed a **Chat Mode streaming bug.**
  * Resolved **internal server errors** in default mode.
  * Addressed **main regressions** introduced with [Sonnet 3.7](https://lovable.dev/blog/anthropic-sonnet-3-7-lovable-diff-viewer).
  * Fixed **SQL syntax errors.**
  * Resolved **issues with mixing migrations and secret management** in a single edit.
</Update>

<Update label="Feb 28, 2025" description="Code Viewer">
  * All Lovable users are now using Sonnet 3.7 for the main workflow, which means that Lovable is now smarter than ever before.
  * [Introducing Code viewer to Lovable](https://x.com/lovable_dev/status/1895500151889768596): You can now view the code of your lovable project. As before you can also make code edits to lovable projects through Github.
  * No more requests to support asking "*Why is my project broken*". Now we show the actual error messages in the error dialog that should help you fix the error yourself.
  * Bug fix of users reporting project version reversion due to Supabase connection.
  * '*Edit*' mode auto close after editing an element.
</Update>

<Update label="Feb 21, 2025">
  * [Improvements in visual edits](https://x.com/lovable_dev/status/1892249059718484100) that includes editing font weights, alignment and image resizing.
  * Fixed Supabase syntax issues for smoother integration and fewer errors during deployment.
  * Resolved an issue where some users were redirected to the homepage unexpectedly.
  * Connecting to APIs and external data sources can be tricky. We’ve made it easier. Lovable now reads network logs directly, using them as context to debug and implement third-party integrations more effectively. No more disruptive error pop-ups—Lovable now uses real-time network insights to help you fix issues faster and keep building.
  * Fixed issues with last fetch commits, ensuring accurate and up-to-date project syncing.
  * No more stuck on `saving changes...`  for messages that produces code and don't result in a commit (for instance the AI tries to edit a file without permission or no changes were made)
</Update>

<Update label="Feb 12, 2025" description="Visual Edits">
  * [Introducing Visual Edits.](https://lovable.dev/blog/introducing-visual-edits)
  * [Supabase Integration 2.0.](https://lovable.dev/blog/lovable-supabase-integration-second-version)
  * Changelog is now posted here on the documentation rather than scattered places.
  * Improved documentation with new integrations, prompt guide and user guides.
  * Worldwide Lovable Hackathon. [Apply here](https://lu.ma/1dl5m906).
  * Increased capacity for LLM calls, reducing the risk of mid-process rate limits.
  * Preview deploys and production deploys of apps working again.
  * Resolved issue where users were redirected to the homepage upon entering a project.
  * Fixed inconsistency in fetching the last commit due to misconfigured repositories using both S3 and GitHub.
  * Fixed failure in remixes and transfers for projects with a custom main branch override.
  * Resolved a Python logging name conflict that occasionally caused errors.
  * Fixed the issue where the select and edit tool was missing for new projects.
  * Beautiful revert buttons
</Update>

<Update label="Feb 7, 2025" description="Go migration">
  * Chat mode is getting smarter & will now start counting towards your message limit.
  * [From Python to Go](https://lovable.dev/blog/from-python-to-go) for stability, responsive platform and faster feature releases.
  * Introduction of [Lovable Launched](https://lovable.dev/blog/2025-01-30-how-to-launch-and-get-traffic-to-an-app-built-with-lovable) where you can publish your app to get in front of users.
  * [Cloudflare R2](https://www.cloudflarestatus.com/) is down. It's back again running.
  * [Lovable support 2.0](https://lovable.dev/support) is up and running.
</Update>

<Update label="Jan 28, 2025" description="Figma to Lovable">
  * Figma to Lovable: Turn Designs into code with Builder.io.
  * Improved visibility of reverts.
  * Support for Replicate has improved.
  * Support for Resend has improved with the transition to the Node SDK.
  * When creating signup and login flows, Lovable builds custom authentication UIs tailored to match your app.
  * Managing roles in a Supabase-powered application is now more reliable.
  * Lovable now supports building on top of Realtime OpenAI using RTC.
</Update>

<Update label="Jan 18, 2025">
  * lovable.app DNS issues resolved.
  * Sandbox issues are resolved, and the service is fully operational again.
  * Supabase connection issue resolved, simply press the "Add another organization".
</Update>

<Update label="Jan 6, 2025">
  * [GitHub Integration Outage](https://lovable.dev/news/github-incident-2025-01-02).
  * New Labs section, accessible via Settings -> Account Settings -> Labs.
  * Visit [our support page](https://lovable.dev/support) to get help, submit issues, or learn more about using Lovable.
  * Better Support for Scraping and Node Graphs with Firecrawl and React Flow.
  * “Edit with Lovable” Badge enabled for all users.
  * Select-to-Edit is now located directly in chat composer.
  * Upcoming 5-part live series to build & launch an AI-powered Spanish tutor.
  * Unlimited weekend!
</Update>

<Update label="Dec 11, 2024">
  * Customizable messaging limits to the Scale plan.
  * “Ask the AI to fix” won’t count toward your usage limits. 
  * Showcase Your Builds in the Hall of Fame.
  * Integrate Stripe, Three.js, p5.js, Resend & Fabric.js.
  * [Christmas Hackathon](https://hackathon.lovable.app/submit) to win \$3,000+ in prizes.
  * Issues with our cloud provider resolved.
</Update>

<Update label="Dec 3, 2024" description="Lovable 1.0">
  * **Templates**: Build Faster with Pre-Built Designs.
  * Introducing feedback.lovable.dev for feature and integration request.
  * Added the shadcn sidebar and support for 3D apps with three.js. 
  * You can now track your remaining messages by visiting your [settings page](https://lovable.dev/settings).
  * Lovable will no longer introduce refactors automatically.
  * Added support for the new [shadcn sidebar component](https://ui.shadcn.com/docs/components/sidebar).
  * Improved the stability of the page dropdown.
  * Added a new [FAQ](https://docs.lovable.dev/faq) and an [E2E tutorial](/introduction/getting-started) to guide users through.
  * Issues with our cloud provider resolved.
  * When you send a chat request, we make sure to check that all project deps are up-to-date.
</Update>


## Related topics

- [API changelog](/api-reference/changelog.md)
