vcl 4.1;

import std;
import bodyaccess;

# this is the backend that should be cached
backend default {
  .host = "$BACKEND_HOST";
  .port = "$BACKEND_PORT";
  .first_byte_timeout = $BACKEND_FIRST_BYTE_TIMEOUT;
}

# remove cookies from response
sub vcl_backend_response {
  if (beresp.http.Cache-Control) {
    unset beresp.http.Cache-Control;
  }

  set beresp.ttl = $CACHE_TTL;

  # handle errors
  if ($DISABLE_ERROR_CACHING && beresp.status >= 400) {
    # send requests directly to the backend for the next ttl period
    set beresp.ttl = $DISABLE_ERROR_CACHING_TTL;
    set beresp.uncacheable = true;
    return (deliver);
  }
}

# remove incoming cookies and allow caching POST requests
sub vcl_recv {
  unset req.http.X-Body-Len;

  if (req.method == "POST") {
    std.cache_req_body($BODY_SIZE);
    set req.http.X-Body-Len = bodyaccess.len_req_body();
    if (req.http.X-Body-Len == "-1") {
      return (pass);
    }
    # SPARQL updates (INSERT, DELETE, CLEAR, DROP, LOAD, ADD, MOVE, COPY,
    # CREATE) mutate data and must always hit the backend.  The keywords are
    # matched as whole words so reads mentioning e.g. "address" or "created"
    # are still cached; a false positive is only a cache miss.  Note VRE has
    # no \b support, hence the handrolled word boundaries.
    if (bodyaccess.rematch_req_body("(?i)(^|[^a-z])(insert|delete|clear|drop|load|create|move|copy|add)([^a-z]|$)")) {
      return (pass);
    }
    return (hash);
  }

  if (req.method != "GET" && req.method != "HEAD") {
    return (pass);
  }

  # Same update guard for queries passed via the query string (GET), e.g.
  # /sparql?query=INSERT...
  if (req.method == "GET" && req.url ~ "(?i)(^|[^a-z])(insert|delete|clear|drop|load|create|move|copy|add)([^a-z]|$)") {
    return (pass);
  }

  return (hash);
}

# https://docs.varnish-software.com/tutorials/caching-post-requests/#step-3-change-the-hashing-function
sub vcl_hash {
  hash_data(req.http.Authorization);
  hash_data(req.url);
  # The response of a SPARQL endpoint varies with the requested
  # serialization, so the Accept header is part of the cache key.
  hash_data(req.http.Accept);
  # mu-authorization (sparql-parser) derives the accessible graphs solely
  # from the mu-auth-allowed-groups header when it is set (mu-identifier
  # always sets it: session-derived for logged-in users, the public default
  # for anonymous users).  Including it in the hash gives every access
  # context its own cache entries, so cached private responses can never be
  # served to public users.  mu-auth-sudo and mu-auth-scope are included as
  # defense in depth: mu-identifier strips them from incoming requests, so
  # they should never be set on this route.
  hash_data(req.http.mu-auth-allowed-groups);
  hash_data(req.http.mu-auth-sudo);
  hash_data(req.http.mu-auth-scope);

  # to cache POST and PUT requests
  if (req.http.X-Body-Len) {
    bodyaccess.hash_req_body();
  } else {
    hash_data("");
  }

  return (lookup);
}

# https://docs.varnish-software.com/tutorials/caching-post-requests/#step-4-make-sure-the-backend-gets-a-post-request
sub vcl_backend_fetch {
  if (bereq.http.X-Body-Len) {
    set bereq.method = "POST";
  }
}

# add a header to see if it was a cache miss or a cache hit
sub vcl_deliver {
  # https://happyculture.coop/blog/varnish-4-comment-savoir-si-votre-page-vient-du-cache
  if (resp.http.X-Varnish ~ "[0-9]+ +[0-9]+") {
    set resp.http.X-Cache = "HIT";
  } else {
    set resp.http.X-Cache = "MISS";
  }
}
