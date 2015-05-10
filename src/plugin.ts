export interface IRegister {
    (server:any, options:any, next:any): void;
    attributes?: any;
}

export default
class Chat {
    socketio:any;
    io:any;
    constructor() {
        this.register.attributes = {
            name: 'ark-chat',
            version: '0.1.0'
        };

        this.socketio = require('socket.io');
    }

    register:IRegister = (server, options, next) => {
        server.bind(this);
        this.io = this.socketio(server.listener);
        this._register(server, options);
        next();
    };

    private _register(server, options) {
        this.io.on('connection', (socket) => {

            socket.emit('Oh hii!');

            socket.on('burp', () => {
                socket.emit('Excuse you!');
            });
        });

        server.route({
            method: 'GET',
            path: '/getRooms',
            config: {
                handler: this.getRoomsRoute
            }
        });
    }

    getRoomsRoute(request, reply) {
        var userId = request.auth.credentials._id;

        reply({test: 'test'});
    }

    errorInit(error) {
        if (error) {
            console.log('Error: Failed to load plugin (Chat):', error);
        }
    }
}