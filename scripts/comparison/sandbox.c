#include <node_api.h>
#include <sandbox.h>
#include <stdlib.h>
static napi_value enter(napi_env env, napi_callback_info info) {
  size_t argc = 1, length; napi_value arg, result; char *error = NULL;
  napi_get_cb_info(env, info, &argc, &arg, NULL, NULL);
  napi_get_value_string_utf8(env, arg, NULL, 0, &length);
  char *profile = malloc(length + 1);
  napi_get_value_string_utf8(env, arg, profile, length + 1, &length);
  int status = sandbox_init(profile, 0, &error); free(profile);
  if (status) { napi_throw_error(env, NULL, error ? error : "sandbox_init failed"); if (error) sandbox_free_error(error); return NULL; }
  napi_get_boolean(env, 1, &result); return result;
}
static napi_value init(napi_env env, napi_value exports) {
  napi_value fn; napi_create_function(env, "enter", NAPI_AUTO_LENGTH, enter, NULL, &fn);
  napi_set_named_property(env, exports, "enter", fn); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
