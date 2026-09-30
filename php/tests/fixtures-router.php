<?php
// A tiny stand-in for the API, served by `php -S` in HttpTest.
header('content-type: application/json');
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if ($auth !== 'Bearer uvk_test_local') {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => ['code' => 'invalid_api_key', 'message' => 'Bad key'], 'request_id' => 'req_401']);
    return;
}
$body = json_decode((string) file_get_contents('php://input'), true) ?? [];
if (($body['id_number'] ?? '') === 'bad') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => ['code' => 'validation_error', 'message' => 'Invalid', 'details' => ['id_number must be the 11-digit NIN']], 'request_id' => 'req_400']);
    return;
}
echo json_encode(['success' => true, 'data' => $_SERVER['REQUEST_METHOD'] === 'GET' ? ['balance' => 1234.5] : ['id' => 'v1', 'status' => 'verified', 'echo' => $body], 'request_id' => 'req_ok']);
