# Token-Based Auth Testing Checklist

## Prerequisites
- [ ] Backend server stopped
- [ ] Frontend dev server running
- [ ] User account exists in Supabase
- [ ] Supabase connection working

## Step 1: Restart Backend

```bash
cd C:\Users\Aditya Sebastian\Desktop\BOT\Kuboid\backend
python -m uvicorn RAG.docs:app --reload --port 8000
```

**Expected:** Server starts without errors

## Step 2: Hard Refresh Frontend

- [ ] Open browser to Documents page
- [ ] Press `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
- [ ] Clear browser cache if needed

## Step 3: Sign In

- [ ] Navigate to `/auth` page
- [ ] Sign in with valid credentials
- [ ] Redirected to Documents page

## Step 4: Test URL Submission

### Submit URL
- [ ] Enter URL: `https://example.com`
- [ ] Click Submit

### Check Browser Console
- [ ] Open DevTools (F12)
- [ ] Go to Network tab
- [ ] Find POST request to `/process-url`
- [ ] Check Request Headers:
  ```
  Authorization: Bearer eyJhbGc...
  ```
- [ ] Verify token is present and starts with "Bearer "

### Check Response
- [ ] Status: 200 OK
- [ ] Response includes `chunks_created` field
- [ ] Toast notification shows "URL processed"

## Step 5: Verify Database

### Check url_ingestion_activity Table

Open Supabase Dashboard → Table Editor → `url_ingestion_activity`

**Look for most recent row:**

- [ ] `user_id` column: **NOT NULL** ✅ (should have UUID value)
- [ ] `site_id` column: **NOT NULL** ✅ (should have same UUID value)
- [ ] `url` column: Has the URL you submitted
- [ ] `status` column: `processing` or `success`

**Example Expected Result:**
```
id: abc-123-...
url: https://example.com
user_id: def-456-your-user-id
site_id: def-456-your-user-id
status: success
```

## Step 6: Test Error Cases

### Test Without Sign In

- [ ] Sign out from application
- [ ] Try to submit a URL
- [ ] **Expected:** Toast shows "Not signed in - Please sign in to submit URLs"
- [ ] **Expected:** No request sent to backend

### Test with Expired Session

- [ ] Sign in
- [ ] Wait for session to expire (or manually clear token)
- [ ] Try to submit a URL
- [ ] **Expected:** Error about invalid/missing token

## Step 7: Test Multi-User Isolation

### User A
- [ ] Sign in as User A
- [ ] Submit URL: `https://docs.userA.com`
- [ ] Note User A's ID from database

### User B
- [ ] Sign out
- [ ] Sign in as User B (different account)
- [ ] Submit URL: `https://docs.userB.com`
- [ ] Note User B's ID from database

### Verify Separation
- [ ] Check database - two different `user_id` values
- [ ] User A's activities have User A's ID
- [ ] User B's activities have User B's ID

## Step 8: Backend Logs Check

Monitor backend terminal for:

```
INFO: Persisting URL activity abc-123-...
INFO: 🌐 Processing URL: https://example.com
INFO: 📦 Created X chunks from URL
INFO: ✅ Generated X embeddings
INFO: 💾 Storing in Qdrant...
INFO: Stored X chunks for document url_example_com_...
INFO: 🎉 Successfully processed URL: https://example.com
```

- [ ] No errors in logs
- [ ] Processing completes successfully
- [ ] Chunks stored with site_id

## Common Issues & Fixes

### ❌ Issue: user_id still NULL

**Solutions:**
1. [ ] Restart backend server
2. [ ] Hard refresh browser (Ctrl+Shift+R)
3. [ ] Verify you're signed in
4. [ ] Check token is in request headers

### ❌ Issue: "Missing authorization token"

**Solutions:**
1. [ ] Verify user is signed in
2. [ ] Check `supabase.auth.getSession()` returns session
3. [ ] Clear browser cache and sign in again

### ❌ Issue: "Invalid authorization token"

**Solutions:**
1. [ ] Sign out and sign in again (get fresh token)
2. [ ] Check token format in request (should be "Bearer ...")
3. [ ] Verify Supabase credentials in .env

### ❌ Issue: Frontend error "userId is not defined"

**Solutions:**
1. [ ] This should NOT happen anymore with token approach
2. [ ] If it does, check that code was properly updated
3. [ ] Verify `handleUrlSubmit` doesn't reference `userId` variable

## Success Criteria

✅ All checklist items completed  
✅ `user_id` populated in database (not NULL)  
✅ `site_id` populated in database (not NULL)  
✅ No frontend errors  
✅ No backend errors  
✅ Token visible in request headers  
✅ Multi-user isolation working  

## Final Verification

Run this SQL query to see last 5 URL activities:

```sql
SELECT 
  id,
  url,
  user_id,
  site_id,
  status,
  created_at
FROM url_ingestion_activity
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:** All rows have `user_id` and `site_id` populated

---

## Quick Test Commands

**Check if backend is running:**
```bash
curl http://localhost:8000/health
```

**Test token extraction (with your token):**
```bash
curl -X POST http://localhost:8000/process-url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"url": "https://test.com", "request_id": "test-123"}'
```

---

**Date:** 2025-01-26  
**Status:** Token-based auth implemented ✅  
**Next Steps:** Test and verify all checklist items