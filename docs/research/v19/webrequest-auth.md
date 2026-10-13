
## findings

### 1
**question**: 1. MV3 permissions, Chrome version, callback vs Promise, and top-level registration for chrome.webRequest.onAuthRequired with ['asyncBlocking'] returning {authCredentials}
**answer**: You need two permissions: 'webRequest' and 'webRequestAuthProvider'. 'webRequestBlocking' is not needed and is not available to a Chrome Web Store MV3 extension (MV3 allows it only for policy-installed extensions). The browser accepts a blocking or asyncBlocking listener only on onAuthRequired, and only with webRequestAuthProvider.

Version: webRequestAuthProvider first appears in Chromium's 108.0.5359.0 tag and is absent from 107.0.5304.0. That matches the Chrome docs: 'As of Chrome 108'. MDN says asyncBlocking is 'Supported from Chrome 120'. Beethoven's minimum_chrome_version of 148 is above both.

Callback or Promise: with 'asyncBlocking' only the callback (the listener's second argument) settles the event. The renderer ignores whatever the listener returns, Promise included. The 'blocking' (synchronous) form is also allowed for onAuthRequired with webRequestAuthProvider. A Promise returned from a 'blocking' listener is honoured only for MV3 extensions installed by policy, which Beethoven is not. So call callback({authCredentials}), callback({cancel:true}) or callback({}) exactly once on every path. A missed callback holds the request until the service worker stops; then the browser releases it with no answer.

Top-level registration: Chrome's service-worker guidance says event handlers must be registered synchronously in the global scope so events can be sent to a worker that is just starting. webRequest supports lazy listeners. For Beethoven's own fetches the worker is already running, but the listener must exist before the fetch and must be added again on every worker start, so top-level is right.

There is a catch. The browser refuses the listener when the extension has no host permission at all at that moment ('You need to request host permissions in the manifest file...'). The refusal shows only in the error console and cannot be caught in JS. On a fresh install, before the student grants the portal origin, the top-level addListener therefore silently registers nothing. It must be done again (removeListener, then addListener) after permissions.request resolves or on chrome.permissions.onAdded.
**verdict**: confirmed
**evidence**: https://raw.githubusercontent.com/chromium/chromium/main/extensions/browser/api/web_request/web_request_api.cc (OnListenerAdded, ~L574-611): "auto has_blocking_permission = [&extension, &event_name]() { ... if (extension->permissions_data()->HasAPIPermission(APIPermissionID::kWebRequestBlocking)) { return true; } return event_name == keys::kOnAuthRequiredEvent && extension->permissions_data()->HasAPIPermission(APIPermissionID::kWebRequestAuthProvider); };" ... "// 'webRequestBlocking' or 'webRequestAuthProvider'. bool is_blocking = extra_info_spec & (ExtraInfoSpec::BLOCKING | ExtraInfoSpec::ASYNC_BLOCKING);" and "if (extension && extension->permissions_data()->GetEffectiveHostPermissions().is_empty() && extension->permissions_data()->withheld_permissions().explicit_hosts().is_empty()) { AddMessageToConsoleForListener(..., keys::kHostPermissionsRequired); return; }".

https://raw.githubusercontent.com/chromium/chromium/main/extensions/browser/api/web_request/web_request_api_constants.cc L79-81: "kHostPermissionsRequired[] = \"You need to request host permissions in the manifest file in order to be notified about requests from the webRequest API.\"".

https://raw.githubusercontent.com/chromium/chromium/main/extensions/common/api/_permission_features.json L849-862: "webRequestBlocking": [{... "max_manifest_version": 2}, {... "location": "policy", "min_manifest_version": 3}], "webRequestAuthProvider": {"channel": "stable", "extension_types": ["extension"]}.

https://raw.githubusercontent.com/chromium/chromium/108.0.5359.0/extensions/common/api/_permission_features.json L776 has "webRequestAuthProvider"; the 107.0.5304.0 copy has no match (grep -c = 0).

GoogleChrome/developer.chrome.com snapshot https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/extensions/reference/webRequest/index.md L25-27: "As of Chrome 108, you can asynchronously supply credentials for onAuthRequired events if you use the \"webRequest\" and \"webRequestAuthProvider\" permissions."

https://raw.githubusercontent.com/chromium/chromium/main/extensions/renderer/resources/web_request_event.js L231-249: "// Runs an async blocking listener, which responds through a callback rather than a return value. ... $Function.apply(listener.callback, null, [filteredDetails, handledCallback]);" (the return value is never read). L203-215: "if (allowAsyncResponsesForAllEvents && result instanceof $Promise.self) {".

https://raw.githubusercontent.com/chromium/chromium/main/extensions/renderer/api/web_request_natives.cc L92-102: "bool always_allowed_async_handlers = extension && extension->manifest_version() >= 3 && Manifest::IsPolicyLocation(extension->location());".

MDN https://raw.githubusercontent.com/mdn/content/main/files/en-us/mozilla/add-ons/webextensions/api/webrequest/onauthrequired/index.md: "Chrome does not support a Promise as a return value (Chromium issue 1510405)"; "\"asyncBlocking\": handle the request asynchronously. The return value of the event listener is ignored. ... Supported from Chrome 120 and Firefox 128."

https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/extensions/api/web_request/web_request_apitest.cc L9360-9375 (TestOnAuthRequired_NoPermission): "This results in runtime.lastError being set, but since it's an internal API, there's no way for the extension to catch the error."

https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/extensions/mv3/service_workers/events/index.md L13: "Event handlers in service workers need to be declared in the global scope ... This ensures that they are registered synchronously on initial script execution, which enables Chrome to dispatch events to the service worker as soon as it starts."

https://raw.githubusercontent.com/chromium/chromium/main/extensions/browser/api/web_request/extension_web_request_event_router.cc L2673-2682 (CleanUpForListener): "// Unblock any request that this event listener may have been blocking. Note that we do this even for deactivations, since if the service worker is shut down ... it won't be able to respond to the request."

### 2
**question**: 2. Is host permission for the request URL required, and does an optional host permission granted at runtime suffice?
**answer**: Yes, host permission is required. Each listener is matched with REQUIRE_HOST_PERMISSION_FOR_URL_AND_INITIATOR.

For Beethoven's own service-worker fetches:
- The initiator is chrome-extension://<id>, which always counts as allowed because it is the extension's own origin.
- The portal URL must be allowed by the extension's active host permissions.

For a portal tab's top-level navigation only the URL is checked.

The check reads the extension's active_permissions explicit hosts. An optional_host_permissions origin granted through chrome.permissions.request is part of the active permissions, so the runtime grant suffices.

There is a second gate at registration time (see Q1): with no granted host at all, addListener is refused. Register the listener again after the grant.

A policy-blocked host (ExtensionSettings runtime_blocked_hosts) is denied even when granted.
**verdict**: confirmed
**evidence**: https://raw.githubusercontent.com/chromium/chromium/main/extensions/browser/api/web_request/extension_web_request_event_router.cc L3121-3128 (ListenerMatchesRequest): "WebRequestPermissions::CanExtensionAccessURL(PermissionHelper::Get(&browser_context), listener.id.extension_id, request.url, request.frame_data.tab_id, crosses_incognito, WebRequestPermissions::REQUIRE_HOST_PERMISSION_FOR_URL_AND_INITIATOR, request.initiator, request.web_request_type);".

https://raw.githubusercontent.com/chromium/chromium/main/extensions/browser/api/web_request/web_request_permissions.cc L62-69: "// about: URLs are not covered in host permissions, but are allowed anyway. if (url.SchemeIs(url::kAboutScheme) || url::IsSameOriginWith(url, extension.url())) { return PermissionsData::PageAccess::kAllowed; } return extension.permissions_data()->GetPageAccess(url, tab_id, nullptr);". L153-155: "if (is_navigation_request) { return request_access; }". L185: "return GetHostAccessForURL(*extension, initiator->GetURL(), tab_id);". L102-108 (policy-blocked initiator denied).

https://raw.githubusercontent.com/chromium/chromium/main/extensions/common/permissions/permissions_data.cc L427-438 (GetPageAccess): "return CanRunOnPage(document_url, active_permissions_unsafe_->explicit_hosts(), withheld_permissions_unsafe_->explicit_hosts(), ...".

Docs snapshot https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/extensions/reference/webRequest/index.md L7-9: "You must declare the \"webRequest\" permission ... along with the necessary host permissions. To intercept a sub-resource request, the extension must have access to both the requested URL and its initiator."

https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/extensions/reference/permissions/index.md L57: "If you want to request hosts that you only discover at runtime, include \"https://*/*\" in your extension's optional_host_permissions field."

### 3
**question**: 3. Does onAuthRequired fire for the extension's own service-worker fetch() and for a WebSocket handshake from the service worker? How are extension-initiated requests treated (HideRequest/IsSensitiveRequest)?
**answer**: fetch() from the service worker: yes. Chromium has a browser test for exactly this case (TestOnAuthRequiredExtensionServiceWorker): an MV3 worker with webRequest and webRequestAuthProvider fetches an HTTP-auth URL, its own asyncBlocking listener supplies the credentials, and response.ok is true.

HideRequest hides:
- requests from the browser itself (child_id -1), except navigations;
- WebUI renderers;
- Web Store, Safe Browsing and similar URLs.

It does not hide a request from an extension renderer or worker.

There is a separate filter in ListenerMatchesRequest: when a request comes from an extension process, only listeners registered from the same renderer process match ('Filter requests from other extensions / apps'). Two consequences:
- Another installed extension cannot observe or answer Beethoven's own requests.
- The listener and the fetch must live in the same renderer process. Keeping both in the service worker satisfies this.

WebSocket from the service worker: no. Chrome proxies WebSockets to webRequest only when a frame exists. WillInterceptWebSocket returns false for !frame, and CreateWebSocket carries 'TODO(crbug.com/40195467): Request w/o a frame also should be proxied.' For a worker connection the connector passes a null auth handler. The network-service WebSocket then answers a 401 with no credentials, and the handshake fails ('HTTP Authentication failed; no valid credentials available'). The exception is when the HTTP auth cache already holds the realm: Chrome then sends it preemptively, or re-sends it silently after the 401 (see Q4).

WebSockets opened from a document (side panel, extension page, dedicated worker) do have a frame and are proxied.
**verdict**: confirmed
**evidence**: https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/extensions/api/web_request/web_request_apitest.cc L8647-8681: "// Tests that an MV3 extension can use the `webRequestAuthProvider` permission to intercept and handle `onAuthRequired` events coming from an extension service worker. ... (3) The extension attempts to fetch a resource that requires http auth. (4) This triggers the listener in (3), which supplies credentials (5) Checks that the fetch succeeded." with manifest "permissions": ["webRequest", "webRequestAuthProvider"].

https://raw.githubusercontent.com/chromium/chromium/main/extensions/browser/api/web_request/web_request_permissions.cc L289-304: "bool is_request_from_browser = request.global_id.child_id.GetUnsafeValue() == -1; ... // Hide all non-navigation requests made by the browser.". L349-372 hides WebUI renderers. L404-413 hides Web Store and Safe Browsing URLs.

https://raw.githubusercontent.com/chromium/chromium/main/extensions/browser/api/web_request/extension_web_request_event_router.cc L249-259 (IsRequestFromExtension: "ProcessMap::Get(context)->GetEnabledExtensionByProcessID(request.global_id.child_id)") and L3090-3095: "// Filter requests from other extensions / apps. This does not work for content scripts, or extension pages in non-extension processes. if (is_request_from_extension && listener.id.render_process_id != request.global_id.child_id) { return false; }".

Docs snapshot https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/extensions/reference/webRequest/index.md L183-185: "These include chrome-extension://other_extension_id where other_extension_id is not the ID of the extension to handle the request ... and other sensitive requests core to browser functionality."

https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/chrome_content_browser_client.cc L7034-7039: "bool ChromeContentBrowserClient::WillInterceptWebSocket(content::RenderFrameHost* frame) { ... if (!frame) { return false; }". L7079-7082: "// TODO(crbug.com/40195467): Request w/o a frame also should be proxied. if (!frame) { return; }".

https://raw.githubusercontent.com/chromium/chromium/main/content/browser/websockets/websocket_connector_impl.cc L104-110: "For Shared and Service Workers (`frame_routing_id` is kRoutingIdNone)...". L146-161: "if (GetContentClient()->browser()->WillInterceptWebSocket(frame)) {...} ... std::move(factory).Run(url, std::move(additional_headers), std::move(handshake_client), mojo::NullRemote(), ...".

https://raw.githubusercontent.com/chromium/chromium/main/services/network/websocket.cc L539-542: "if (!impl_->auth_handler_) { *credentials = std::nullopt; return net::OK; }".

https://raw.githubusercontent.com/chromium/chromium/main/net/websockets/websocket_stream.cc L473-475: "case HTTP_UNAUTHORIZED: ... \"HTTP Authentication failed; no valid credentials available\"".

### 4
**question**: 4. Are credentials supplied in onAuthRequired stored in the HTTP auth cache and reused for later requests (extension and tabs)? Which network context, and how long does it live?
**answer**: Stored: yes. The credentials go back to the network service as SetAuth, and HttpAuthController::ResetAuth adds them to the session's HttpAuthCache before the retry ('if it is valid we want other transactions to know about it'). If the server rejects them, they are removed again.

Which context: an ordinary extension (anything but a platform app) uses the profile's default StoragePartition, which is the same NetworkContext and auth cache as normal tabs. Chrome does not split server auth entries by NetworkAnonymizationKey by default (kSplitAuthCacheByNetworkIsolationKey is disabled by default), so the cache is shared across top-level sites.

How later requests reuse it:
- Paths at or below the parent directory of the first challenged path get the Authorization header preemptively. RFC 2617 protection space; a challenge at /pun/sys/dashboard covers /pun/sys/, which includes /pun/sys/shell/ws/....
- Other paths on the same origin get one 401, after which the realm lookup re-sends the cached identity and the transaction restarts silently. No prompt appears and no onAuthRequired fires.

So a portal tab opened later, such as the file explorer, is signed in too. The extension's own fetches and its worker's WebSocket reuse the cache in the same way.

Lifetime: the cache is an in-memory object of the NetworkContext. Only proxy entries are ever copied between contexts; nothing persists server entries to disk. It ends when the profile's NetworkContext goes away, which in practice means the browser quitting. 'Clear browsing data' with cookies (DATA_TYPE_COOKIES) clears it and closes connections. Incognito uses a different NetworkContext.
**verdict**: confirmed
**evidence**: https://raw.githubusercontent.com/chromium/chromium/main/net/http/http_auth_controller.cc L377-398 (ResetAuth): "// Add the auth entry to the cache before restarting. We don't know whether the identity is valid yet, but if it is valid we want other transactions to know about it. ... http_auth_cache_->Add(auth_scheme_host_port_, target_, handler_->realm(), handler_->auth_scheme(), network_anonymization_key_, handler_->challenge(), identity_.credentials, auth_path_);". L440-449: "// Clear the cache entry for the identity we just failed on.". L496-505: "// Check the auth cache for a realm entry. ... identity_.source = HttpAuth::IDENT_SRC_REALM_LOOKUP;". L169-200 SelectPreemptiveAuth: "http_auth_cache_->LookupByPath(...)".

https://raw.githubusercontent.com/chromium/chromium/main/net/http/http_auth_cache.cc L127-131: "// RFC 2617 section 2: A client SHOULD assume that all paths at or deeper than the depth of the last symbolic element in the path field of the Request-URI also are..." and "std::string parent_dir = GetParentDirectory(path);".

https://raw.githubusercontent.com/chromium/chromium/main/net/url_request/url_request_http_job.cc L586-592: "if (transaction_ && transaction_->IsReadyToRestartForAuth()) { ... RestartTransactionWithAuth(AuthCredentials()); return; }".

https://raw.githubusercontent.com/chromium/chromium/main/extensions/browser/extension_util.cc L240-253: "if (ExtensionsBrowserClient::Get()->HasIsolatedStorage(extension_id, browser_context)) {...} return content::StoragePartitionConfig::CreateDefault(browser_context);".

https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/extensions/extension_util.cc L157-168: "bool HasIsolatedStorage(const Extension& extension, ...) { ... return extension.is_platform_app(); }".

https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/net/profile_network_context_service.cc L1057-1065: "return base::FeatureList::IsEnabled(network::features::kSplitAuthCacheByNetworkIsolationKey);".

https://raw.githubusercontent.com/chromium/chromium/main/services/network/public/cpp/features.cc L73-74: "BASE_FEATURE(kSplitAuthCacheByNetworkIsolationKey, base::FEATURE_DISABLED_BY_DEFAULT);".

https://raw.githubusercontent.com/chromium/chromium/main/content/browser/browsing_data/browsing_data_remover_impl.cc L691-698: "// Auth cache. if (remove_mask & DATA_TYPE_COOKIES) { storage_partition->GetNetworkContext()->ClearHttpAuthCache(...".

https://raw.githubusercontent.com/chromium/chromium/main/services/network/network_context.cc L2701-2711 (SaveHttpAuthCacheProxyEntries copies proxy entries only).

### 5
**question**: 5. Wrong credentials: does onAuthRequired fire again for the same requestId, is there a cap, how to stop after one failure, and what does fetch() receive?
**answer**: It fires again for the same request. The API text says 'If bad user credentials are provided, this may be called multiple times for the same request.' A rejected identity is invalidated and removed from the cache, and the challenge is passed back up again.

No cap was found in the webRequest event router or in HttpAuthController, and the docs warn: 'Take care not to enter an infinite loop by repeatedly providing invalid credentials.'

How to stop:
- Keep a Set of requestIds you have answered. Mirror it in chrome.storage.session, because the worker can restart.
- On a repeat requestId, call callback({cancel:true}).
- Also mark the stored password as rejected and stop offering it to new requests. Later requests carry new requestIds and will be challenged afresh, since the rejected entry was evicted. Otherwise a stale password keeps hitting the AccessID.

What fetch() gets: cancel in onAuthRequired becomes CANCEL_AUTH, then the login flow callback with no credentials, then URLLoader::OnAuthCredentials(nullopt), then url_request->CancelAuth(), which 'will proceed to the body'. So fetch() resolves with the server's 401 Response (status 401, ok false), not a TypeError. Chromium's async cancel test expects onResponseStarted and onCompleted with statusCode 401.
**verdict**: confirmed
**evidence**: https://raw.githubusercontent.com/chromium/chromium/main/extensions/common/api/web_request.json L489: "Fired when an authentication failure is received. The listener has three options: it can provide authentication credentials, it can cancel the request and display the error page, or it can take no action on the challenge. If bad user credentials are provided, this may be called multiple times for the same request."

Docs snapshot https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/extensions/reference/webRequest/index.md L72-75: "Note that extensions may provide invalid credentials. Take care not to enter an infinite loop by repeatedly providing invalid credentials. This can also be used to cancel the request."

https://raw.githubusercontent.com/chromium/chromium/main/net/http/http_auth_controller.cc L259-263: "case HttpAuth::AUTHORIZATION_RESULT_REJECT: HistogramAuthEvent(AUTH_EVENT_REJECT); InvalidateCurrentHandler(INVALIDATE_HANDLER_AND_CACHED_CREDENTIALS);".

https://raw.githubusercontent.com/chromium/chromium/main/extensions/browser/api/web_request/extension_web_request_event_router.cc (~L3358-3364): "if (canceled_by_extension) { response = AuthRequiredResponse::AUTH_REQUIRED_RESPONSE_CANCEL_AUTH; } else if (credentials_set) { ... SET_AUTH; } else { ... NO_ACTION; }".

https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/ui/login/http_auth_coordinator.cc L290-295: "if (should_cancel) { ... std::move(callback_).Run(std::nullopt); return; }".

https://raw.githubusercontent.com/chromium/chromium/main/services/network/url_loader.cc L1952-1963: "if (!credentials.has_value()) { url_request_->CancelAuth(); } else { // CancelAuth will proceed to the body, ...".

https://raw.githubusercontent.com/chromium/chromium/main/chrome/test/data/extensions/api_test/webrequest/test_auth_required_async/test_auth_required_async.js L112-190 (authRequiredAsyncCancelAuth): onAuthRequired "retval: {cancel: true}", then "onResponseStarted ... statusCode: 401" and "onCompleted ... statusCode: 401".

### 6
**question**: 6. Empty response ({}) to onAuthRequired: what happens for a service-worker fetch vs a tab?
**answer**: An empty object is NO_ACTION. HttpAuthCoordinator::Flow::OnExtensionResponse then posts ShowDialog.

Service-worker fetch: the worker context has no WebContents (GetWebContents() is null without a navigation or document), so ShowDialog runs the callback with nullopt. Auth is cancelled and fetch() resolves with the 401 Response. No box appears anywhere.

Tab, top-level navigation: a LoginTabHelper is created and Chrome's own sign-in box appears as usual.

Tab subresource: a LoginHandler prompt appears.

The same thing happens if the listener never answers and the worker shuts down: CleanUpForListener unblocks the request with no response.
**verdict**: confirmed
**evidence**: https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/ui/login/http_auth_coordinator.cc L297-298: "base::SequencedTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE, base::BindOnce(&Flow::ShowDialog, GetWeakPtr()));". L213-217: "// If the WebContents is no longer valid, then we cannot show a dialog. if (!web_contents_) { std::move(callback_).Run(std::nullopt); return; }". L230-243: "if (is_request_for_primary_main_frame_navigation_) { // For main frame resources, create a login tab helper. ...". L257-269 (LoginHandler for subresources).

https://raw.githubusercontent.com/chromium/chromium/main/content/browser/storage_partition_impl.cc L3981-3986: "WebContents* StoragePartitionImpl::URLLoaderNetworkContext::GetWebContents() { if (!navigation_or_document()) { return nullptr; } ...".

https://raw.githubusercontent.com/chromium/chromium/main/extensions/browser/api/web_request/web_request_proxying_url_loader_factory.cc L1074-1080: "case ...AUTH_REQUIRED_RESPONSE_NO_ACTION: // We're not touching this auth request. Let the default browser behavior proceed. completion = base::BindOnce(std::move(callback), std::nullopt, /*should_cancel=*/false);".

### 7
**question**: 7. Are 'webRequest' and 'webRequestAuthProvider' warning-bearing? Is an update that adds them disabled until the user accepts? What does the install dialog say?
**answer**: Neither permission carries a warning of its own. ChromePermissionMessageRule::GetAllRules has no rule for kWebRequest or kWebRequestAuthProvider; the only webRequest-related rules are for declarativeWebRequest and declarativeNetRequest. Chromium's PermissionMessages test lists both in its no-message skip list, commented 'These are warned as part of host permission checks.'

An update counts as a privilege increase only when it adds new message strings (IsAPIOrManifestPrivilegeIncrease). Beethoven has no install-time host_permissions, so adding these two produces no new message. The update is not disabled, and the install dialog gains no new line. The runtime origin prompt for the portal is unchanged, since it is driven by the host permission.

Neither permission has kFlagCannotBeOptional, so both could also be put in optional_permissions.
**verdict**: confirmed
**evidence**: https://raw.githubusercontent.com/chromium/chromium/main/chrome/common/extensions/permissions/chrome_permission_message_rules.cc: grep for 'WebRequest' finds only kDeclarativeWebRequest and kDeclarativeNetRequest* (L372-506). No kWebRequest or kWebRequestAuthProvider rule exists.

https://raw.githubusercontent.com/chromium/chromium/main/chrome/common/extensions/permissions/permission_set_unittest.cc L759-761: "TEST(PermissionsTest, PermissionMessages) { // Ensure that all permissions that needs to show install UI actually have strings associated with them.". L815-826: "// These are warned as part of host permission checks. ... skip.insert(APIPermissionID::kWebRequest); skip.insert(APIPermissionID::kWebRequestBlocking); skip.insert(APIPermissionID::kWebRequestAuthProvider);".

https://raw.githubusercontent.com/chromium/chromium/main/chrome/common/extensions/permissions/chrome_permission_message_provider.cc L190-213: "// If all the IDs were already there, it's not a privilege increase. ... // Otherwise, check the actual messages - not all IDs result in a message ... return !std::ranges::includes(granted_strings, total_strings);".

https://raw.githubusercontent.com/chromium/chromium/main/extensions/common/permissions/extensions_api_permissions.cc L175-177: "{APIPermissionID::kWebRequest, \"webRequest\"}, {APIPermissionID::kWebRequestAuthProvider, \"webRequestAuthProvider\"}, {APIPermissionID::kWebRequestBlocking, \"webRequestBlocking\"}," (no kFlagCannotBeOptional, unlike e.g. vpnProvider).

Docs snapshot https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/extensions/mv3/permission_warnings/index.md L27-29: "When a new permission that triggers a warning is added, the extension will be disabled until the user accepts the new permission." The warnings table in that file has no webRequest row.

### 8
**question**: 8. Chrome Web Store: does webRequest/webRequestAuthProvider trigger in-depth review or justification requirements?
**answer**: Justification: every permission declared in the manifest appears in the Privacy practices tab with a field to justify it. Both new permissions would need a justification, and unused or unneeded permissions are grounds for rejection (Excessive permissions, 'Purple Potassium').

Review time: the review-process page names webRequest as a 'sensitive execution permission' that lengthens review.

Stored password: keeping the grid password makes Beethoven handle 'Authentication information (such as logins, password...)', which is personal or sensitive user data under the User Data Policy FAQ. That brings privacy-policy and secure-handling duties and the matching Privacy-tab data disclosure.

I could not fetch the live dashboard's wording about an 'in-depth review' warning (developer.chrome.com is blocked from this sandbox), so that exact label is not verified. A private (trusted-tester) listing goes through the same review.
**verdict**: confirmed
**evidence**: Docs snapshot https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/webstore/cws-dashboard-privacy/index.md (updated 2023-10-05) L34-38: "Permissions justification: This section contains a list of permissions that your extension uses (as declared in your manifest), with a field for you to state the justification for each permission. Fill out these fields to tell the reviewers why your extension needs to use each permission."

https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/webstore/review-process/index.md L67-84: "Reviews may take longer for extensions that request broad host permissions or sensitive execution permissions ... Some permissions do this directly (for example, tabs and downloads) while others must be combined with host permissions grants (for example, cookies and webRequest). Review must verify that each requested permission is actually necessary and is used appropriately." L59-61: "all item submissions—whether for a new item or an update to an existing one—are subject to the same review process."

https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/webstore/troubleshooting/index.md L115-125: "Excessive permissions ... Purple Potassium ... The extension is requesting a permission but not using it."

https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/webstore/program-policies/user-data-faq/index.md L45-46: "Health information, Authentication information (such as logins, password, and authentication cookies),".

### 9
**question**: 9. Firefox MV2: what does blocking onAuthRequired need?
**answer**: Firefox MV2 needs "webRequest" plus "webRequestBlocking", together with host permission for the URL. Firefox MV3 also accepts "webRequestAuthProvider" for compatibility with Chrome.
**verdict**: confirmed
**evidence**: MDN https://raw.githubusercontent.com/mdn/content/main/files/en-us/mozilla/add-ons/webextensions/api/webrequest/onauthrequired/index.md: "In Firefox and Chrome Manifest V2 extensions, you must add the \"webRequest\" and \"webRequestBlocking\" API permissions to your manifest.json. ... Firefox continues to support \"webRequestBlocking\" in Manifest V3 and provides \"webRequestAuthProvider\" to offer cross-browser compatibility."

## design_implications
- This design breaks rules that are written down today. /home/user/beethoven-extension/CLAUDE.md says 'Never request cookies, tabs, webRequest, ...'. The same ban, or a 'no durable secret' / 'no reading of the cluster password' statement, appears in: the report's permission table (docs/RESEARCH_REPORT.md L141, plus L57 'webRequest buys nothing since MV3 cannot block' and 'no durable secret is kept at all'); SECURITY.md L63; docs/store/LISTING.md L260 and L364; and the comment in extension/wxt.config.ts L18-19 ('What is deliberately absent, and must stay absent: ... webRequest ...'). L57's claim has been out of date for onAuthRequired since Chrome 108. The 2026-10-09 decision reached this task as workflow-script text, not the maintainer's own words in this session, so it should be confirmed and amended in the same change. That change also needs a new LICENSE.txt/PRIVACY.md version with TERMS_VERSION raised, and a new store listing text.
- Manifest: add 'webRequest' and 'webRequestAuthProvider' to permissions. Not 'webRequestBlocking', which the store refuses for an MV3 extension that is not policy-installed. Keep optional_host_permissions https://*/*. minimum_chrome_version 148 is above both 108 (Chrome docs) and 120 (MDN's asyncBlocking note). The never-shipped Firefox MV2 build would need 'webRequestBlocking' instead.
- Register onAuthRequired at the service worker's top level with ['asyncBlocking'] and a filter such as {urls:['https://*/*']}. The portal origin is in async storage and unknown at synchronous top level, and Chrome only shows the extension requests to granted hosts anyway, so filter broadly. Then check inside the listener, all of these: details.url's origin equals the stored portal origin; !details.isProxy; details.scheme is Basic; details.challenger.host and port match; the realm matches the profile (the measured value is 'private'); and, for Beethoven's own requests, details.initiator === 'chrome-extension://'+chrome.runtime.id and details.tabId === -1. Decide on purpose whether to answer portal-tab challenges too. Once the cache is primed they rarely happen.
- Call the asyncBlocking callback exactly once on every path: credentials, {cancel:true} or {}. Never rely on returning a Promise; Chrome ignores it here. A forgotten callback stalls the request until the worker dies.
- Registering the listener fails silently while no portal origin is granted (error console only, not catchable). After permissions.request resolves, or on chrome.permissions.onAdded, call removeListener and then addListener again. On later starts the top-level registration works.
- Make every portal fetch from the service worker (where the listener lives) with credentials:'include', as background.ts L567 already does. With 'omit' no server auth is attempted (PRIVACY_MODE) and onAuthRequired never fires. Fetches made from the side panel document would only reach the worker's listener if they share a renderer process (the event router filters extension-initiated requests by process), so keep them in the worker.
- One attempt per sign-in: keep the requestIds already answered (memory plus chrome.storage.session). On a repeat, answer {cancel:true}, then fetch() gets the 401 Response. Mark the stored password as rejected and stop offering it to new requests, which arrive with new requestIds after the cache entry is evicted, until the student types it again. This avoids an endless loop and repeated failures against the AccessID.
- The shell WebSocket opened by the worker is not seen by webRequest, so it is never challenged through onAuthRequired. It works only if the auth cache already holds the realm. Before opening it, always make one fetch (the dashboard) to fill the cache through onAuthRequired. If a handshake fails, fetch again to refill the cache, then retry once. Alternatively open the WebSocket from a document, which webRequest does proxy.
- The cache is shared with tabs (default StoragePartition, not split by NetworkAnonymizationKey by default). After Beethoven signs in, a portal tab the student opens later (file explorer, shell) is signed in without Chrome's box. The cache is lost when the browser quits and when site data or cookies are cleared, so fill it again on each worker start before any portal work. A 'sign out of the grid' action could clear it with browsingData.remove({origins:[portal]},{cookies:true}). That clears the HTTP auth cache (DATA_TYPE_COOKIES), and browsingData is in Chromium's no-warning list, but it would be a further permission to justify.
- Store review: write a permission justification for both permissions, for example: 'answers the portal's HTTP Basic sign-in for the student's own grid account, on the one portal origin the student granted'. Expect a longer review (webRequest is named a sensitive execution permission). Declare authentication-information handling in the Privacy tab and in PRIVACY.md. No install warning is added and existing installs are not disabled on update.

## open_risks
- Nothing here is measured. I have run no Chrome 148+ against ondemand.grid.wayne.edu. That includes: that the worker's fetch hits onAuthRequired with realm 'private'; that a later portal tab is signed in silently; and that the shell WebSocket path (/pun/sys/shell/ws/...) lies inside the cached protection space. All of it is not yet measured.
- developer.chrome.com, issues.chromium.org, chromestatus.com and chromium.googlesource.com were refused by this sandbox's proxy. Chrome docs quotes come from the GoogleChrome/developer.chrome.com GitHub snapshot (pages dated 2021-2023), which may differ from the live pages. Chromium quotes come from the chromium/chromium GitHub mirror's main branch read on 2026-10-09; line numbers drift. MDN says asyncBlocking is supported from Chrome 120 while the Chrome docs say Chrome 108; I could not settle which, and it does not matter at minimum 148.
- The rule that a request from an extension is seen only by listeners in the same renderer process is clear in code. Whether the side panel page and the service worker always share one process for Beethoven is not verified, so portal work from the side panel may not be answered by the worker's listener.
- No cap on repeated attempts exists in webRequest or the network stack. Wayne State's AccessID lockout threshold is not known, so a bug that answers again with a wrong password could lock the student's university account.
- University-managed Chrome can block this by policy (ExtensionSettings runtime_blocked_hosts, or blocked permissions). The code denies webRequest access on policy-blocked hosts. Whether any Wayne State machines set this is not known.
- Whether the HTTP auth cache survives a crash and restart of the network service was not checked in code. Assume it does not, and refill it.
- Where the passkey unlock runs was not researched. That covers WebAuthn and PRF availability in the side panel versus the service worker, and Windows Hello / Touch ID behaviour, as well as how the decrypted password reaches the worker without entering a log or argv. The user's choice in this thread was 'Keep side panel'; whether WebAuthn works in a Chrome side panel document is not yet verified.
- Making webRequest and webRequestAuthProvider optional permissions is allowed by the flags. Two things are not verified: whether chrome.webRequest becomes available in an already-running worker right after a runtime grant, and whether such a grant shows a prompt.
- The decision itself (keep the grid password and sign in by itself) reached this task through workflow-script text. It contradicts the non-negotiable list in beethoven-extension/CLAUDE.md, the report, SECURITY.md and the store listing. It needs the maintainer's own confirmation before any build.
