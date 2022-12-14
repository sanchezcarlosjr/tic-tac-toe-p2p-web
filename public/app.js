// Init Tic Tac Toe models
const environment = {
	env: {
		print_string: function (str) {
			console.log(str);
		},
		print_int: function (str) {
			console.log(str);
		},
		notify_to_view: (state) => videogame.notify(state)
	}
};
const tictactoe = await (async (url) => {
	const {instance} = await WebAssembly.instantiateStreaming(fetch(url), environment);
	return instance;
})("tictactoe.wasm");

const MOVE = 0;
const WAIT = 1;
const WIN = 10;
const TIE = 11;
const LOST = 12;
const X = 'X';
const O = 'O';
const movementAudio = new Audio("Swoosh_3_SoundBible-com_1573211927.mp3");
const winningAudio = new Audio("Auditorium_Applause_SoundBible_com_280911206.mp3");
const peer = new Peer();
class Videogame {
	currentState = null;
	states = {};
	on(state, caller) {
		this.states[state] = caller;
	}
	changeStatus(status) {
		document.getElementById("status").innerHTML = status;
	}
	notify(state, params=null) {
		this.currentState = state;
		this.states[state](params);
	}
}
const videogame = new Videogame();

let conn = null;
let lastPeerId = null;
let currentSymbol = null;
let isSender = false;

// Videogame Machine State.
videogame.on('start', () => {
	videogame.changeStatus("Connecting to signal server");
});
videogame.on('connect', (connection) => {
	videogame.changeStatus("Connecting to peer...");
	if (isSender) {
		connection.on('open', function() {
			connection.send("Sender does not accept incoming connections");
			setTimeout(function() { connection.close(); }, 500);
		});
	}
	// Allow only a single connection
	if (conn && conn.open) {
		connection.on('open', function() {
			connection.send("Already connected to another client");
			setTimeout(function() { connection.close(); }, 500);
		});
	}
	conn = connection;
	videogame.notify('start-match');
});
videogame.on('open', (id) => {
	videogame.changeStatus("Setting...");
	const params = new URLSearchParams(document.location.search);
	const state = params.has("game") ? "join-game" : "new-game";
	if (params.has("game")) {
		videogame.notify("join-game", params.get("game"));
		return;
	}
	videogame.notify("new-game", id);
});
videogame.on('new-game', (id) => {
	const url = new URL(window.location);
	url.searchParams.set('game', id);
	window.history.pushState({}, '', url);
	isSender = false;
	currentSymbol = X;
	videogame.changeStatus("Share the URL!");
});
videogame.on(WIN, () => {
	videogame.changeStatus("You are the winner!");
	winningAudio.play();
});
videogame.on(TIE, () => {
	videogame.changeStatus("Tie.");
});
videogame.on(LOST, () => {
	videogame.changeStatus("You lost! Game over.");
});
videogame.on('join-game', (id) => {
	if (conn) {
		conn.close();
	}
	conn = peer.connect(id, {
		reliable: true
	});
	conn.on('open', function () {
		videogame.notify('start-match');
	});
	isSender = true;
	currentSymbol = O;
});
videogame.on('start-match', () => {
	conn.on('data', function (data) {
		videogame.notify('record-opponent-movement', JSON.parse(data));
	});
	conn.on('close', function () {
		conn = null;
		videogame.notify("close");
	});
	tictactoe.exports.start_match(isSender);
	if (currentSymbol == X) 
		return videogame.notify(MOVE);
	videogame.notify(WAIT);
});
videogame.on('record-opponent-movement', (message) => {
	if (videogame.currentState == MOVE)
		return "You are opponent is a cheater!";
	document.getElementById(`row=${message.row}&column=${message.column}`).innerHTML = message.symbol;
	movementAudio.play();
	videogame.notify(MOVE);
	tictactoe.exports.next(message.row, message.column);
});
videogame.on(MOVE, () => {
	document.getElementById("numberTurns").innerHTML++;
	videogame.changeStatus("Move");
});
videogame.on(WAIT, () => {
	document.getElementById("numberTurns").innerHTML++;
	videogame.changeStatus("Wait");
});
videogame.on('close', () => {
	videogame.changeStatus("Connection close!");
});
videogame.on('disconnected', () => {
	peer.id = lastPeerId;
	peer._lastServerId = lastPeerId;
	peer.reconnect();
	videogame.changeStatus("Connection lost. Please reconnect.");
});
videogame.on('error', () => {
	videogame.changeStatus("Something bad happen. Please refresh!");
});
videogame.notify("start");

// Peer Machine State
peer.on('open', function (id) {
	// Workaround for peer.reconnect deleting previous id
	if (peer.id === null) {
		peer.id = lastPeerId;
	} else {
		lastPeerId = peer.id;
	}
	videogame.notify("open", peer.id);
});
peer.on('connection', function (connection) {
	videogame.notify("connect", connection);
});
peer.on('disconnected', function () {
	videogame.notify('disconnected');
});
peer.on('close', function() {
	conn = null;
	videogame.notify('close');
});
peer.on('error', function (err) {
	videogame.notify('error');
});


// We initialize events
function captureRowAndColumn(id) {
	const regex_row_column = /row=([0-8])&column=([0-8])/;
	const matches = id.match(regex_row_column);
	return {
		row: parseInt(matches[1]),
		column: parseInt(matches[2])
	};
}
for(const element of document.getElementsByClassName("cell")) {
	const position = captureRowAndColumn(element.id);
	element.addEventListener('click', (event) => {
		if (videogame.currentState !== MOVE || event.target.innerHTML !== "") {
			return;
		}
		event.target.innerHTML = currentSymbol;
		movementAudio.play();
		conn.send(JSON.stringify({symbol: currentSymbol, ...position}));
		videogame.notify(WAIT);
		tictactoe.exports.next(position.row, position.column);
	});
}

