import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { socialPresentation } from "../../../../packages/auth/src/social-presentation";
import { LAST_SIGN_IN_COOKIE } from "../../../../packages/contracts/src/account/auth";
import {
  captureScreenshot,
  completeOnboarding,
  openUserSettings,
  signup,
} from "../helpers/helpers";

const passwordOnly = {
  passwordAuth: true,
  sso: null,
  passwordReset: true,
  resetUrl: "http://127.0.0.1:5173/reset-password",
  providers: [] as { id: string; name: string }[],
};

const both = [
  { id: "google", name: "Google", presentation: socialPresentation("google") },
  { id: "apple", name: "Apple", presentation: socialPresentation("apple") },
];

async function mockSignedOut(page: Page, providers: typeof both | []) {
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await page.route("**/api/auth/sign-in/social", (route) =>
    route.fulfill({ status: 404, json: { message: "not called" } }),
  );
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({ json: { ...passwordOnly, providers } }),
  );
}

async function expectEmailSignIn(page: Page) {
  await expect(page.getByRole("heading", { name: "SparkAI", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to SparkAI" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue with Apple" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue with email" })).toHaveCount(0);
  await expect(page.getByText("Last used")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /passkey/i })).toHaveCount(0);
}

test("sign-in stays on the SparkAI email form when providers are configured", async ({
  page,
}, testInfo) => {
  await mockSignedOut(page, both);
  await page.goto("/sign-in");
  await expectEmailSignIn(page);
  await captureScreenshot(page, testInfo, "sign-in-email");
});

test("a remembered sign-in method does not badge the email form", async ({ page }, testInfo) => {
  await mockSignedOut(page, both);
  await page.context().addCookies([
    {
      name: LAST_SIGN_IN_COOKIE,
      value: "google",
      url: testInfo.project.use.baseURL!,
    },
  ]);
  await page.goto("/sign-in");
  await expectEmailSignIn(page);
});

test("linked social accounts use a supported deletion confirmation method", async ({
  page,
}, testInfo) => {
  await signup(
    page,
    `social-confirmation-${Date.now()}@rakazo.test`,
    "password12",
    "Confirmation QA",
  );
  await completeOnboarding(page);
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({ json: { ...passwordOnly, providers: both } }),
  );
  await page.route("**/api/auth/account-security", (route) =>
    route.fulfill({
      json: {
        hasPassword: false,
        freshOidcAuth: false,
        ssoLinked: false,
        sso: null,
        emailDeletion: true,
        linkedProviderIds: ["google", "apple"],
        // An older in-flight server must not restore unsupported confirmation choices.
        reauthenticationProviders: both,
      },
    }),
  );
  const settings = await openUserSettings(page);
  await settings.getByTestId("delete-account").click();
  await expect(
    settings.getByRole("button", { name: "Send deletion code", exact: true }),
  ).toBeVisible();
  await expect(settings.getByRole("button", { name: "Sign in again", exact: true })).toHaveCount(0);
  await expect(
    settings.getByRole("button", { name: "Continue with Google", exact: true }),
  ).toHaveCount(0);
  await expect(
    settings.getByRole("button", { name: "Continue with Apple", exact: true }),
  ).toHaveCount(0);
  await captureScreenshot(page, testInfo, "social-account-deletion-confirmation");
});
