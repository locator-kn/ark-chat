export interface IRegister {
    (server:any, options:any, next:any): void;
    attributes?: any;
}

export default
class Chat {
    socketio:any;
    io:any;
    joi:any;
    db:any;

    constructor() {
        this.register.attributes = {
            pkg: require('./../../package.json')
        };

        this.socketio = require('socket.io');
        this.joi = require('joi');
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

        /**
         * get all conversations for currently logged in user
         */
        server.route({
            method: 'GET',
            path: '/my/conversations',
            config: {
                handler: (request, reply) => {
                    var userId = request.auth.credentials._id;
                    this.db.getConversationsByUserId(userId, (err, conversations) => {
                        if (!err) {
                            return reply(conversations);
                        }
                        reply(err);
                    });

                }
            }
        });

        server.route({
            method: 'GET',
            path: '/conversations/{conversationId}',
            config: {
                handler: (request, reply) => {
                    var conversationId = request.params.conversationId;
                    var userId = request.auth.credentials._id;

                    this.db.getConversationById(conversationId, (err, conversation) => {

                        if (!err) {
                            // check if user is participating conversation
                            if (conversation.user_1 === userId || conversation.user_2 === userId) {
                                return reply(conversation);
                            } else {
                                return reply({message: 'you are not a fellow of this conversation'}).code(401);
                            }
                        }
                        reply(err);
                    });

                }
            }
        });

        server.route({
            method: 'GET',
            path: '/messages/{conversationId}',
            config: {
                handler: (request, reply) => {
                    var conversationId = request.params.conversationId;

                    this.db.getMessagesByConversionId(conversationId, (err, messages) => {

                        if (!err) {
                            return reply(messages);
                        }
                        reply(err);
                    });

                }
            }
        });

        var newConversationSchema = this.joi.object().keys({
            user_id: this.joi.string().required(),
            message: this.joi.string().required()
        });

        server.route({
            method: 'POST',
            path: '/conversations',
            config: {
                handler: (request, reply) => {
                    var userId = request.auth.credentials._id;
                    var conversation = {
                        user_1: userId,
                        user_2: request.payload.user_id,
                        user_1_read: true,
                        user_2_read: false,
                        messages: [{
                            from: userId,
                            timestamp: Date.now(),
                            message: request.payload.message
                        }],
                        type: 'conversation'
                    };

                    this.db.createConversation(conversation, (err, data) => {
                        if (!err) {
                            return reply(data);
                        }
                        reply(err);
                    });
                },
                description: 'Creates a new conversation with a user',
                notes: 'with_user needs to be a valid from a user',
                tags: ['api', 'chat', 'conversation'],
                validate: {
                    payload: newConversationSchema
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