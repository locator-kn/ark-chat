export interface IRegister {
    (server:any, options:any, next:any): void;
    attributes?: any;
}

export default
class Chat {
    joi:any;
    boom:any;
    db:any;
    hoek:any;
    realtime:any;

    constructor() {
        this.register.attributes = {
            pkg: require('./../../package.json')
        };

        this.joi = require('joi');
        this.boom = require('boom');
        this.hoek = require('hoek');
    }

    register:IRegister = (server, options, next) => {
        server.bind(this);


        server.dependency(['ark-database', 'ark-realtime'], (server, continueRegister) => {

            this.db = server.plugins['ark-database'];
            this.realtime = server.plugins['ark-realtime'];
            continueRegister();

            this._register(server, options);
            next();
        });
    };

    private _register(server, options) {

        /**
         * get all conversations for currently logged in user
         */
        server.route({
            method: 'GET',
            path: '/my/conversations',
            config: {
                handler: (request, reply) => {
                    var userId = request.auth.credentials._id;
                    this.db.getConversationsByUserId(userId).then(conversations => {
                        if (conversations.length) {
                            conversations.forEach((con:any) => {
                                if (con.user_1 === userId) {
                                    con.opponent = con.user_2;
                                } else {
                                    con.opponent = con.user_1;
                                }
                                delete con.user_1;
                                delete con.user_2;
                            });
                        }
                        return reply(conversations);
                    }).catch(reply);
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

                    // use pagination
                    if (request.query.page) {
                        this.db.getPagedMessagesByConversationId(conversationId, request.query)
                            .then(conversation => {
                                if (conversation.user_1 === userId || conversation.user_2 === userId) {
                                    return reply(conversation);
                                } else {
                                    return reply({message: 'you are not a fellow of this conversation'}).code(401);
                                }
                            }).catch(reply)

                    } else {

                        this.db.getConversationById(conversationId)
                            .then(conversation => {
                                // check if user is participating conversation
                                if (conversation.user_1 === userId || conversation.user_2 === userId) {
                                    return reply(conversation);
                                } else {
                                    return reply({message: 'you are not a fellow of this conversation'}).code(401);
                                }

                            }).catch(reply)
                    }
                },
                validate: {
                    params: {
                        conversationId: this.joi.string().required()
                    },
                    query: this.joi.object().keys({
                        page: this.joi.number().integer(),
                        elements: this.joi.number().integer().positive()
                    }).and('page', 'elements')
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
                            if (!messages.length) {
                                return reply(this.boom.notFound());
                            }
                            return reply(messages);
                        }
                        reply(this.boom.create(400, err));
                    });

                },
                description: 'Get all messages of a conversation',
                notes: 'getMessagesByConversionId',
                tags: ['chat', 'messages'],

            }
        });

        server.route({
            method: 'POST',
            path: '/messages/{conversationId}',
            config: {
                handler: (request, reply) => {
                    var receiver = request.payload.to;

                    var messageObj = {
                        conversation_id: request.params.conversationId,
                        from: request.payload.from,
                        to: receiver,
                        message: request.payload.message,
                        timestamp: Date.now(),
                        type: 'message'
                    };

                    this.saveMessage(messageObj, receiver, (err, data) => {
                        if (!err) {
                            return reply({message: 'message sent'});
                        }
                        return reply(this.boom.create(400, err));
                    })

                },
                validate: {
                    payload: this.joi.object().keys({
                        from: this.joi.string().required(),
                        to: this.joi.string().required(),
                        message: this.joi.string().required()
                    })
                },
                description: 'Create a new message in a conversation',
                notes: 'This will also emit a websocket message to the user',
                tags: ['chat', 'messages', 'websockets']
            }
        });


        var newConversationSchema = this.joi.object().keys({
            user_id: this.joi.string().required(),
            message: this.joi.string().required(),
            trip: this.joi.string()
        }).required();

        server.route({
            method: 'POST',
            path: '/conversations',
            config: {
                handler: (request, reply) => {
                    var userId = request.auth.credentials._id;
                    var tripId = request.payload.trip;

                    this.db.getExistingConversationByTwoUsers(userId, request.payload.user_id, (err, conversations) => {
                        if (!err) {
                            // if not empty, a conversation already exists
                            if (conversations.length) {

                                return reply(this.boom.conflict('Conversation already exists', conversations[0]));
                            }
                            var opp = request.payload.user_id;
                            var conversation:any = {
                                user_1: userId,
                                user_2: opp,
                                type: 'conversation'
                            };

                            // add trip to conversation
                            if (tripId) {
                                conversation.trip = request.payload.trip;
                            }

                            conversation[userId + '_read'] = true;
                            conversation[opp + '_read'] = false;

                            this.db.createConversation(conversation, (err, data) => {
                                if (!err) {
                                    var receiver = request.payload.to;

                                    var messageObj = {
                                        conversation_id: data._id || data.id,
                                        from: conversation.user_1,
                                        to: conversation.user_1,
                                        message: request.payload.message,
                                        timestamp: Date.now(),
                                        type: 'message'
                                    };
                                    this.saveMessage(messageObj, receiver, (err, data) => {
                                        if (!err) {
                                            // return conversations_id instead of messageID: https://github.com/locator-kn/ark/issues/24
                                            data.id = messageObj.conversation_id;
                                            return reply(data);
                                        }
                                        return reply(this.boom.badRequest(err));
                                    });

                                } else {
                                    return reply(this.boom.create(400, err));
                                }
                            });
                        }
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

    saveMessage(messageObj, receiver, callback) {
        this.db.saveMessage(messageObj, (err, data) => {
            if (!err) {
                this.realtime.emitMessage(receiver, this.hoek.merge(messageObj, {opponent: messageObj.from}));
                return callback(null, data);
            }
            return callback(err);

        });
    }

    errorInit(error) {
        if (error) {
            console.log('Error: Failed to load plugin (Chat):', error);
        }
    }
}