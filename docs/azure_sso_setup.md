# How to Configure Azure AD (Entra ID) SSO

This guide walks you through setting up Microsoft Azure Active Directory (now Entra ID) to handle Single Sign-On (SSO) for your NVR.

## Step 1: Create an App Registration in Azure
1. Log in to the [Azure Portal](https://portal.azure.com) as an administrator.
2. Navigate to **Microsoft Entra ID** (formerly Azure Active Directory).
3. In the left sidebar, click **App registrations** > **New registration**.
4. Configure the application:
   - **Name:** `Heimdall NVR` (or whatever you prefer).
   - **Supported account types:** Select `Accounts in this organizational directory only (Single tenant)` (unless you want external guests to log in).
   - **Redirect URI:** Select `Web` from the dropdown, and enter your NVR's callback URL. This will be `http://<YOUR_NVR_IP_OR_DOMAIN>/api/auth/sso/callback`.
5. Click **Register**.

## Step 2: Gather Your Client ID and Tenant ID
After registering, you'll be taken to the application's Overview page.
1. Copy the **Application (client) ID**. You'll need this for the NVR settings.
2. Copy the **Directory (tenant) ID**. You'll use this to build your URLs.

## Step 3: Create a Client Secret
1. In the left sidebar of your App Registration, click **Certificates & secrets**.
2. Click **New client secret**.
3. Add a description (e.g., `NVR App Secret`) and choose an expiration date.
4. Click **Add**.
5. **CRITICAL:** Copy the string under the **Value** column immediately. *You will not be able to see this value again after leaving the page.*

## Step 4: Configure API Permissions
Azure AD requires explicit permission to read the user's basic profile.
1. In the left sidebar, click **API permissions**.
2. Ensure you see `User.Read` (Delegated) under Microsoft Graph. If not, click **Add a permission** > **Microsoft Graph** > **Delegated permissions** and check `User.Read`.
3. Check the box for `email` and `profile` and `openid` under OpenId permissions as well.
4. *(Optional but recommended)* Click **Grant admin consent for [Your Organization]** to prevent users from seeing a permission prompt on their first login.

## Step 5: Enter the Settings into the NVR
Log in to your NVR as `admin`, go to **Settings > SSO**, and enter the following values:

| Field | Value |
| :--- | :--- |
| **Enable SSO** | `Enabled` |
| **Client ID** | Paste the *Application (client) ID* from Step 2. |
| **Client Secret** | Paste the *Secret Value* from Step 3. |
| **Authorization URL** | `https://login.microsoftonline.com/<YOUR_TENANT_ID>/oauth2/v2.0/authorize` |
| **Token URL** | `https://login.microsoftonline.com/<YOUR_TENANT_ID>/oauth2/v2.0/token` |
| **User Info URL** | `https://graph.microsoft.com/oidc/userinfo` |

> [!NOTE]
> Make sure to replace `<YOUR_TENANT_ID>` in the URLs above with your actual *Directory (tenant) ID* from Step 2.

## Step 6: Test the Integration
1. Click **Save SSO Settings** in the NVR.
2. Log out of the NVR.
3. Click the new **Login with Single Sign-On** button. You should be redirected to Microsoft, prompted to log in, and then securely redirected back to the NVR as a verified viewer!
