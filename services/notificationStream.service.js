const clients = new Set();

function addClient(res, counselorId) {
  const client = { res, counselorId };
  clients.add(client);
  return client;
}

function removeClient(client) {
  clients.delete(client);
}

function sendSseEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastNotification(notification) {
  for (const client of clients) {
    if (client.counselorId !== notification.counselorId) {
      continue;
    }

    sendSseEvent(client.res, "notification", notification);
  }
}

function sendHeartbeat() {
  for (const client of clients) {
    sendSseEvent(client.res, "heartbeat", { ts: Date.now() });
  }
}

setInterval(sendHeartbeat, 25000);

module.exports = {
  addClient,
  removeClient,
  broadcastNotification,
  sendSseEvent,
};
