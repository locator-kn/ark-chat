export interface IRegister {
    (server:any, options:any, next:any): void;
    attributes?: any;
}

export default
class Chat {
    socketio:any;
    io:any;
    db:any;
    
    constructor() {
        this.register.attributes = {
            pkg: require('./../../package.json')
        };

        this.socketio = require('socket.io');
    }

    register:IRegister = (server, options, next) => {
        server.bind(this);

        server.dependency('ark-database', (server, continueRegister) => {

            this.db = server.plugins['ark-database'];
            this.io = this.socketio(server.listener);
            continueRegister();
            next();
            this._register(server, options);
        });
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
            path: '/conversations',
            config: {
                handler: (request, reply) => {
                    reply({});
                }
            }
        });
    }

    errorInit(error) {
        if (error) {
            console.log('Error: Failed to load plugin (Chat):', error);
        }
    }
}